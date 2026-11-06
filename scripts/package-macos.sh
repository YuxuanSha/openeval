#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
archive="${1:?Usage: package-macos.sh /absolute/node.tar.gz /absolute/new-output-directory}"
output="${2:?Missing output directory}"
case "$archive" in /*) ;; *) echo 'Archive path must be absolute' >&2; exit 1 ;; esac
case "$output" in /*) ;; *) echo 'Output path must be absolute' >&2; exit 1 ;; esac
if [ -e "$output" ]; then echo 'Refusing to overwrite output directory' >&2; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo 'Commit the reviewed source before packaging' >&2; exit 1; fi
name='OpenEval-0.2.0-build11-r1-macos-arm64'
folder="$output/$name"
mkdir -p "$folder"
OPENEVAL_NODE_ARCHIVE="$archive" OPENEVAL_APP_OUTPUT="$folder/OpenEval.app" OPENEVAL_BUILD_NUMBER=11 bash scripts/build-macos.sh
cp docs/beta-install.zh-CN.md "$folder/INSTALL.zh-CN.md"
cp docs/beta-install.en.md "$folder/INSTALL.en.md"
python3 - "$folder" <<'PY'
import pathlib,json,subprocess,sys,hashlib
folder=pathlib.Path(sys.argv[1])
info={'product':'OpenEval','version':'0.2.0','build':11,'packagingRevision':'r1','architecture':'arm64','minimumMacOS':'13.5','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'signature':'ad-hoc','notarized':False,'bundledNode':'24.22.1','codexBundled':False,'userDataBundled':False}
(folder/'BUILD.json').write_text(json.dumps(info,indent=2)+'\n')
(folder/'VALIDATION.txt').write_text('Candidate package. See the separately delivered validation report before distribution.\nNot tested on a separate Mac or with downloaded-file Gatekeeper quarantine.\n')
files=[{'path':str(p.relative_to(folder)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(folder.rglob('*')) if p.is_file()]
(folder/'MANIFEST.json').write_text(json.dumps({'files':files},indent=2)+'\n')
PY
node scripts/verify-package.mjs "$folder"
/usr/bin/ditto -c -k --norsrc --noextattr --keepParent "$folder" "$output/$name.zip"
(cd "$output" && shasum -a 256 "$name.zip" > SHA256SUMS.txt)
echo "$output/$name.zip"
