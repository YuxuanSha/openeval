#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
build_dir="$root/release/macos-build"
app_dir="${OPENEVAL_APP_OUTPUT:-$root/release/OpenEval.app}"
case "$app_dir" in /*.app) ;; *) echo "OPENEVAL_APP_OUTPUT must be an absolute .app path" >&2; exit 1 ;; esac
if [ -n "${OPENEVAL_DESKTOP_DATA_DIR:-}" ]; then echo 'A distributable app must not embed a personal data path. Unset OPENEVAL_DESKTOP_DATA_DIR before building.' >&2; exit 1; fi
if [ -e "$app_dir" ]; then echo 'release/OpenEval.app already exists; move the previous build aside before rebuilding.' >&2; exit 1; fi
mkdir -p "$build_dir/cache" "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources/runtime"
if [ -n "${OPENEVAL_NODE_ARCHIVE:-}" ]; then
  python3 scripts/bundle-macos-node.py "$OPENEVAL_NODE_ARCHIVE" "$app_dir"
fi
export CLANG_MODULE_CACHE_PATH="$build_dir/cache"
swiftc -target "$(uname -m)-apple-macosx13.0" -module-cache-path "$build_dir/cache" -O -framework AppKit -framework WebKit desktop/macos/App.swift -o "$app_dir/Contents/MacOS/OpenEval"
swiftc -target "$(uname -m)-apple-macosx13.0" -module-cache-path "$build_dir/cache" desktop/macos/Icon.swift -o "$build_dir/icon-maker"
"$build_dir/icon-maker" "$build_dir/OpenEval.iconset"
iconutil -c icns "$build_dir/OpenEval.iconset" -o "$app_dir/Contents/Resources/OpenEval.icns"
python3 - "$app_dir" <<'PY'
import sys,plistlib,os,shutil,pathlib,hashlib,json,re
app=pathlib.Path(sys.argv[1]);root=pathlib.Path.cwd();target=app/'Contents/Resources/runtime'
paths=['server','shared','assets/builtin-skills','web/dist','desktop/server.mjs','desktop/check-workspace.mjs','package.json','LICENSE','LICENSES','THIRD_PARTY_NOTICES.md','web/third_party/opendesign','web/OPENDESIGN_REFERENCE.md']
for item in paths:
 src=root/item;dest=target/item;dest.parent.mkdir(parents=True,exist_ok=True)
 if src.is_symlink() or (src.is_dir() and any(p.is_symlink() for p in src.rglob('*'))):raise SystemExit('Distribution input contains a symlink: '+item)
 if src.is_dir():shutil.copytree(src,dest)
 else:shutil.copy2(src,dest)
package=json.loads((root/'package.json').read_text())
version=os.environ.get('OPENEVAL_VERSION',package['version']).split('-')[0]
build_number=os.environ.get('OPENEVAL_BUILD_NUMBER',version)
if not re.fullmatch(r'\d+\.\d+\.\d+',version) or not re.fullmatch(r'\d+(?:\.\d+){0,2}',build_number):raise SystemExit('Invalid macOS version or build number')
info={'CFBundleExecutable':'OpenEval','CFBundleIdentifier':'org.openeval.desktop','CFBundleName':'OpenEval','CFBundleDisplayName':'OpenEval','CFBundlePackageType':'APPL','CFBundleShortVersionString':version,'CFBundleVersion':build_number,'CFBundleIconFile':'OpenEval','LSMinimumSystemVersion':'13.5' if os.environ.get('OPENEVAL_NODE_ARCHIVE') else '13.0','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True}}
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
manifest=[{'path':str(p.relative_to(target)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in target.rglob('*') if p.is_file()]
(app/'Contents/Resources/runtime-manifest.json').write_text(json.dumps(manifest,indent=2))
PY
node scripts/release-audit.mjs --tree "$app_dir/Contents/Resources/runtime"
python3 - "$app_dir/Contents/Info.plist" <<'PY'
import sys,plistlib
info=plistlib.load(open(sys.argv[1],'rb'))
if 'OpenEvalDataDirectory' in info:raise SystemExit('Personal data path in distribution Info.plist')
PY
codesign --force --sign - "$app_dir"
codesign --verify --deep --strict "$app_dir"
echo "$app_dir"
