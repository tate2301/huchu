#!/bin/sh
# Rebuild the canvas screens. Needs the icon and font packages in ICONS_ROOT and the saas-design plugin in SAAS_DESIGN.
cd "$(dirname "$0")/../.." && node design/admin/build.mjs
