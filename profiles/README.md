# Druckerprofile

Minislicer nutzt die originalen BambuStudio-Profile (`resources/profiles` — Bambu Lab
und alle Drittanbieter). `./sync_profiles.sh` lädt sie per Sparse-Checkout.

In Phase 2 kommt der Profil-Lader in `web/src/profiles/`, der die
BambuStudio-Vererbung (`inherits`-Ketten) im Browser auflöst und die Profile
lazy nachlädt.
