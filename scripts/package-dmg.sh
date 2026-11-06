#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
app="${1:?Usage: package-dmg.sh /absolute/OpenEval.app /absolute/output.dmg}"
output="${2:?Missing output DMG path}"
case "$app" in /*/OpenEval.app) ;; *) echo 'Expected an absolute OpenEval.app path' >&2; exit 1 ;; esac
case "$output" in /*.dmg) ;; *) echo 'Expected an absolute .dmg output path' >&2; exit 1 ;; esac
if [ -e "$output" ]; then echo 'Refusing to overwrite an existing disk image' >&2; exit 1; fi
/usr/bin/codesign --verify --deep --strict "$app"
python_bin="${OPENEVAL_DMG_PYTHON:-python3}"
"$python_bin" -m dmgbuild -s scripts/dmg-settings.py -D "app=$app" -D "background=$PWD/docs/images/dmg-background.png" 'OpenEval Installer' "$output"
/usr/bin/hdiutil verify "$output"
echo 'Disk image created. This does not sign or notarize the application.'
echo 'A successful local build is not downloaded-app Gatekeeper acceptance.'
shasum -a 256 "$output"
