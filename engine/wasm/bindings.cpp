// Minislicer Engine — "Hello WASM"-Spike (Phase 0)
//
// Beweist die Werkzeugkette C++ → Emscripten → Browser und liefert die
// Mesh-Analyse (Dreiecke, Bounding-Box, Volumen, Oberfläche), die später von
// den KI-Werkzeugen (auto_orient, analyze_overhangs) gebraucht wird.
// In Phase 1 wird dieses Modul durch die Anbindung an libslic3r
// (BambuStudio-Fork) ersetzt bzw. erweitert.

#include <emscripten/bind.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <string>
#include <vector>

#include "slicer.h"

namespace {

constexpr const char* kVersion = "0.2.0";

// positions: flaches Float32Array [x,y,z, x,y,z, ...], drei Vertices je Dreieck, in mm.
std::string analyzeMesh(emscripten::val positions) {
    const std::vector<float> p =
        emscripten::convertJSArrayToNumberVector<float>(positions);

    double volume = 0.0;   // mm^3, signierte Tetraeder gegen den Ursprung
    double surface = 0.0;  // mm^2
    double mn[3] = {1e30, 1e30, 1e30};
    double mx[3] = {-1e30, -1e30, -1e30};

    const size_t nTri = p.size() / 9;
    for (size_t t = 0; t < nTri; ++t) {
        const float* a = &p[t * 9];
        const float* b = a + 3;
        const float* c = a + 6;

        volume += (double(a[0]) * (double(b[1]) * c[2] - double(b[2]) * c[1]) -
                   double(a[1]) * (double(b[0]) * c[2] - double(b[2]) * c[0]) +
                   double(a[2]) * (double(b[0]) * c[1] - double(b[1]) * c[0])) /
                  6.0;

        const double u[3] = {b[0] - a[0], b[1] - a[1], b[2] - a[2]};
        const double v[3] = {c[0] - a[0], c[1] - a[1], c[2] - a[2]};
        const double n[3] = {u[1] * v[2] - u[2] * v[1],
                             u[2] * v[0] - u[0] * v[2],
                             u[0] * v[1] - u[1] * v[0]};
        surface += std::sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) / 2.0;
    }

    for (size_t i = 0; i + 2 < p.size(); i += 3) {
        for (int axis = 0; axis < 3; ++axis) {
            mn[axis] = std::min(mn[axis], double(p[i + axis]));
            mx[axis] = std::max(mx[axis], double(p[i + axis]));
        }
    }

    char buf[256];
    std::snprintf(
        buf, sizeof(buf),
        "{\"triangles\":%zu,\"volume_mm3\":%.3f,\"surface_mm2\":%.3f,"
        "\"size_x\":%.3f,\"size_y\":%.3f,\"size_z\":%.3f}",
        nTri, std::abs(volume), surface,
        nTri ? mx[0] - mn[0] : 0.0, nTri ? mx[1] - mn[1] : 0.0,
        nTri ? mx[2] - mn[2] : 0.0);
    return buf;
}

std::string version() { return kVersion; }

// Sliced die Dreiecks-Suppe und liefert G-Code (siehe slicer.h).
std::string sliceMesh(emscripten::val positions, double layerHeight,
                      double lineWidth, double speed, double nozzleTemp,
                      double bedTemp) {
    const std::vector<float> verts =
        emscripten::convertJSArrayToNumberVector<float>(positions);
    minislicer::SliceParams p;
    p.layer_height = layerHeight;
    p.line_width = lineWidth;
    p.speed = speed;
    p.nozzle_temp = nozzleTemp;
    p.bed_temp = bedTemp;
    return minislicer::sliceToGcode(verts, p);
}

}  // namespace

EMSCRIPTEN_BINDINGS(minislicer_engine) {
    emscripten::function("analyzeMesh", &analyzeMesh);
    emscripten::function("sliceMesh", &sliceMesh);
    emscripten::function("version", &version);
}
