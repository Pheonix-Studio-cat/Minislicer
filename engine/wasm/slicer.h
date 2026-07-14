// Minislicer — Slicing-Kern auf Basis der BambuStudio-Geometrie-Bibliothek.
//
// Die Polygon-Arithmetik (Offsets für Wände, Clipping für die Füllung) läuft
// über Clipper 6.2.9 aus dem BambuStudio-Quellbaum (src/clipper) — dieselbe
// Bibliothek, mit der libslic3r in BambuStudio Perimeter und Infill rechnet.
// Erzeugt werden: mehrere Wände, Rectilinear-Füllung (45°/135° alternierend,
// volle Deck-/Bodenschichten) und G-Code mit den originalen Start-/End-
// Sequenzen aus den BambuStudio-Maschinenprofilen (von der App übergeben).
// Der vollständige libslic3r-Port bleibt Phase 1 (siehe docs/PLAN.md).

#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <unordered_map>
#include <vector>

#include "vendor/clipper/clipper.hpp"

namespace minislicer {

struct SliceParams {
    double layer_height = 0.2;    // mm
    double line_width = 0.42;     // mm
    double speed = 60.0;          // mm/s Druckgeschwindigkeit
    double travel_speed = 150.0;  // mm/s
    double nozzle_temp = 220.0;   // °C
    double bed_temp = 55.0;       // °C
    int walls = 2;                // Anzahl Wände (BambuStudio-Default)
    double infill_density = 0.15; // Anteil 0..1 (BambuStudio-Default 15 %)
    int solid_layers = 3;         // volle Boden-/Deckschichten
    std::string start_gcode;      // aus dem BambuStudio-Maschinenprofil
    std::string end_gcode;
};

namespace detail {

// Skalierung mm → Clipper-Ganzzahlen (10 nm Auflösung, wie in libslic3r üblich)
constexpr double kScale = 1e5;

struct Pt {
    double x, y;
};

inline int64_t quant(double v) { return llround(v * 1000.0); }

struct KeyHash {
    size_t operator()(const std::pair<int64_t, int64_t>& k) const {
        return std::hash<int64_t>()(k.first * 73856093 ^ k.second * 19349663);
    }
};

struct Segment {
    Pt a, b;
    bool used = false;
};

inline Pt edgeCut(const float* p, const float* q, double zc) {
    const double t = (zc - p[2]) / (double(q[2]) - p[2]);
    return {p[0] + t * (double(q[0]) - p[0]), p[1] + t * (double(q[1]) - p[1])};
}

inline std::vector<Segment> layerSegments(const std::vector<float>& v, double zc) {
    std::vector<Segment> segs;
    const size_t nTri = v.size() / 9;
    for (size_t t = 0; t < nTri; ++t) {
        const float* a = &v[t * 9];
        const float* b = a + 3;
        const float* c = a + 6;
        Pt pts[3];
        int n = 0;
        const float* e[3][2] = {{a, b}, {b, c}, {c, a}};
        for (auto& ed : e) {
            const double z0 = ed[0][2], z1 = ed[1][2];
            if ((z0 < zc && z1 >= zc) || (z1 < zc && z0 >= zc)) {
                if (n < 3) pts[n++] = edgeCut(ed[0], ed[1], zc);
            }
        }
        if (n == 2) segs.push_back({pts[0], pts[1]});
    }
    return segs;
}

inline std::vector<std::vector<Pt>> chainSegments(std::vector<Segment>& segs) {
    std::unordered_map<std::pair<int64_t, int64_t>, std::vector<size_t>, KeyHash> byEnd;
    for (size_t i = 0; i < segs.size(); ++i) {
        byEnd[{quant(segs[i].a.x), quant(segs[i].a.y)}].push_back(i);
        byEnd[{quant(segs[i].b.x), quant(segs[i].b.y)}].push_back(i);
    }
    std::vector<std::vector<Pt>> polys;
    for (size_t i = 0; i < segs.size(); ++i) {
        if (segs[i].used) continue;
        segs[i].used = true;
        std::vector<Pt> poly = {segs[i].a, segs[i].b};
        for (;;) {
            const Pt& tail = poly.back();
            auto it = byEnd.find({quant(tail.x), quant(tail.y)});
            if (it == byEnd.end()) break;
            bool extended = false;
            for (size_t j : it->second) {
                if (segs[j].used) continue;
                const bool fwd = quant(segs[j].a.x) == quant(tail.x) &&
                                 quant(segs[j].a.y) == quant(tail.y);
                segs[j].used = true;
                poly.push_back(fwd ? segs[j].b : segs[j].a);
                extended = true;
                break;
            }
            if (!extended) break;
        }
        if (poly.size() >= 3) polys.push_back(std::move(poly));
    }
    return polys;
}

// Verkettete Konturen → bereinigte Clipper-Polygone (Union, Orientierung)
inline ClipperLib::Paths toClipperPolygons(const std::vector<std::vector<Pt>>& polys) {
    ClipperLib::Paths raw;
    for (const auto& poly : polys) {
        ClipperLib::Path p;
        p.reserve(poly.size());
        for (const Pt& pt : poly) {
            p.emplace_back(ClipperLib::cInt(llround(pt.x * kScale)),
                           ClipperLib::cInt(llround(pt.y * kScale)));
        }
        if (p.size() >= 3) raw.push_back(std::move(p));
    }
    return ClipperLib::SimplifyPolygons(raw, ClipperLib::pftNonZero);
}

inline ClipperLib::Paths offsetPolygons(const ClipperLib::Paths& in, double deltaMm) {
    ClipperLib::ClipperOffset co;
    co.MiterLimit = 3.0;
    co.AddPaths(in, ClipperLib::jtMiter, ClipperLib::etClosedPolygon);
    ClipperLib::Paths out;
    co.Execute(out, deltaMm * kScale);
    return out;
}

// Rectilinear-Füllung: parallele Linien im Winkel `angle`, geclippt aufs Gebiet
inline std::vector<std::pair<Pt, Pt>> rectilinearFill(const ClipperLib::Paths& region,
                                                      double spacingMm, double angle) {
    std::vector<std::pair<Pt, Pt>> lines;
    if (region.empty() || spacingMm <= 0) return lines;

    const double ca = std::cos(angle), sa = std::sin(angle);
    // Gebiet ins gedrehte Koordinatensystem bringen
    ClipperLib::Paths rot;
    rot.reserve(region.size());
    double minx = 1e18, maxx = -1e18, miny = 1e18, maxy = -1e18;
    for (const auto& path : region) {
        ClipperLib::Path rp;
        rp.reserve(path.size());
        for (const auto& ip : path) {
            const double x = ip.x() * ca + ip.y() * sa;
            const double y = -ip.x() * sa + ip.y() * ca;
            minx = std::min(minx, x); maxx = std::max(maxx, x);
            miny = std::min(miny, y); maxy = std::max(maxy, y);
            rp.emplace_back(ClipperLib::cInt(llround(x)), ClipperLib::cInt(llround(y)));
        }
        rot.push_back(std::move(rp));
    }

    const double spacing = spacingMm * kScale;
    ClipperLib::Clipper clip;
    clip.AddPaths(rot, ClipperLib::ptClip, true);
    ClipperLib::Path line(2);
    for (double y = miny + spacing / 2; y <= maxy; y += spacing) {
        line[0] = ClipperLib::IntPoint(ClipperLib::cInt(minx - spacing), ClipperLib::cInt(llround(y)));
        line[1] = ClipperLib::IntPoint(ClipperLib::cInt(maxx + spacing), ClipperLib::cInt(llround(y)));
        clip.AddPath(line, ClipperLib::ptSubject, false);
    }
    ClipperLib::PolyTree tree;
    clip.Execute(ClipperLib::ctIntersection, tree,
                 ClipperLib::pftNonZero, ClipperLib::pftNonZero);
    ClipperLib::Paths open;
    ClipperLib::OpenPathsFromPolyTree(tree, open);

    for (const auto& seg : open) {
        if (seg.size() < 2) continue;
        // zurückdrehen
        const double x0 = seg.front().x() * ca - seg.front().y() * sa;
        const double y0 = seg.front().x() * sa + seg.front().y() * ca;
        const double x1 = seg.back().x() * ca - seg.back().y() * sa;
        const double y1 = seg.back().x() * sa + seg.back().y() * ca;
        lines.push_back({{x0 / kScale, y0 / kScale}, {x1 / kScale, y1 / kScale}});
    }
    std::sort(lines.begin(), lines.end(), [](const auto& l, const auto& r) {
        return l.first.y < r.first.y || (l.first.y == r.first.y && l.first.x < r.first.x);
    });
    return lines;
}

}  // namespace detail

inline std::string sliceToGcode(const std::vector<float>& verts, const SliceParams& p) {
    using namespace detail;
    using ClipperLib::Paths;

    double zmin = 1e30, zmax = -1e30;
    for (size_t i = 2; i < verts.size(); i += 3) {
        zmin = std::min(zmin, double(verts[i]));
        zmax = std::max(zmax, double(verts[i]));
    }
    if (verts.empty() || zmax <= zmin) return "; Minislicer: leeres Modell\n";

    const double h = p.layer_height;
    const double w = p.line_width;
    const int nLayers = std::max(1, int(std::floor((zmax - zmin) / h)));

    const double filament_area = M_PI * 0.875 * 0.875;
    const double e_per_mm = (h * w) / filament_area;

    std::string g;
    g.reserve(1 << 22);
    char buf[192];
    auto emit = [&](const char* fmt, auto... args) {
        std::snprintf(buf, sizeof(buf), fmt, args...);
        g += buf;
    };

    double extrudeDist = 0, travelDist = 0;
    double lastX = 0, lastY = 0;

    auto travel = [&](const Pt& to) {
        emit("G0 X%.3f Y%.3f F%.0f\n", to.x, to.y, p.travel_speed * 60);
        travelDist += std::hypot(to.x - lastX, to.y - lastY);
        lastX = to.x; lastY = to.y;
    };
    auto extrude = [&](const Pt& to) {
        const double d = std::hypot(to.x - lastX, to.y - lastY);
        if (d < 1e-6) return;
        extrudeDist += d;
        emit("G1 X%.3f Y%.3f E%.5f F%.0f\n", to.x, to.y, d * e_per_mm, p.speed * 60);
        lastX = to.x; lastY = to.y;
    };

    g += "; generated by Minislicer — Geometrie: Clipper aus BambuStudio (src/clipper)\n";
    emit("; layer_height = %.2f\n; line_width = %.2f\n; wall_loops = %d\n; sparse_infill_density = %.0f%%\n",
         h, w, p.walls, p.infill_density * 100);
    if (!p.start_gcode.empty()) {
        g += ";===== BambuStudio machine_start_gcode =====\n";
        g += p.start_gcode;
        g += "\n;===== Ende machine_start_gcode =====\n";
    } else {
        emit("M104 S%.0f\nM140 S%.0f\nG28\nM190 S%.0f\nM109 S%.0f\n",
             p.nozzle_temp, p.bed_temp, p.bed_temp, p.nozzle_temp);
    }
    g += "G90\nM83\nG92 E0\nM106 S255\n";

    for (int layer = 0; layer < nLayers; ++layer) {
        const double zc = zmin + (layer + 0.5) * h;
        const double printZ = zmin + (layer + 1) * h;
        auto segs = layerSegments(verts, zc);
        auto chains = chainSegments(segs);
        Paths outline = toClipperPolygons(chains);
        emit(";LAYER:%d\nG1 Z%.3f F600\n", layer, printZ);

        // Wände: von innen nach aussen (BambuStudio-Default-Reihenfolge)
        for (int wall = p.walls - 1; wall >= 0; --wall) {
            Paths loops = offsetPolygons(outline, -w * (wall + 0.5));
            for (const auto& loop : loops) {
                if (loop.size() < 3) continue;
                Pt first{loop[0].x() / kScale, loop[0].y() / kScale};
                travel(first);
                for (size_t i = 1; i < loop.size(); ++i) {
                    extrude({loop[i].x() / kScale, loop[i].y() / kScale});
                }
                extrude(first);  // Kontur schliessen
            }
        }

        // Füllung: Boden/Decke voll, sonst sparse; 45°/135° alternierend
        const bool solid = layer < p.solid_layers || layer >= nLayers - p.solid_layers;
        const double density = solid ? 1.0 : p.infill_density;
        if (density > 0.005) {
            Paths fillRegion = offsetPolygons(outline, -w * p.walls - w * 0.5);
            const double spacing = w / density;
            const double angle = (layer % 2 ? 45.0 : 135.0) * M_PI / 180.0;
            auto lines = rectilinearFill(fillRegion, spacing, angle);
            bool flip = false;
            for (auto& ln : lines) {
                const Pt& a = flip ? ln.second : ln.first;
                const Pt& b = flip ? ln.first : ln.second;
                travel(a);
                extrude(b);
                flip = !flip;
            }
        }
    }

    g += "M107\n";
    if (!p.end_gcode.empty()) {
        g += ";===== BambuStudio machine_end_gcode =====\n";
        g += p.end_gcode;
        g += "\n;===== Ende machine_end_gcode =====\n";
    } else {
        g += "M104 S0\nM140 S0\nG91\nG1 Z5 F600\nG90\nM84\n";
    }

    const double timeSec = extrudeDist / p.speed + travelDist / p.travel_speed + nLayers * 0.3;
    const double filamentMm = extrudeDist * e_per_mm;
    emit("; minislicer_layers = %d\n", nLayers);
    emit("; minislicer_time_s = %.0f\n", timeSec);
    emit("; minislicer_filament_mm = %.1f\n", filamentMm);
    return g;
}

}  // namespace minislicer
