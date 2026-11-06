"""Collect exact installed runtime license texts. Run after npm ci in web/."""
import hashlib
import json
from pathlib import Path
import shutil
root = Path(__file__).resolve().parent.parent
base = root / 'web'
lock = json.loads((base / 'package-lock.json').read_text())
out = root / 'LICENSES/markdown-dependencies'
rows = []
for key, entry in lock['packages'].items():
    if not key or entry.get('dev'):
        continue
    folder = base / key
    texts = [p for p in folder.iterdir() if p.is_file() and p.name.lower().startswith(('license', 'licence', 'copying', 'notice', 'thirdpartynotice'))]
    if not texts:
        raise RuntimeError('Runtime license missing: ' + key)
    name = key.split('node_modules/')[-1]
    target = out / name.replace('/', '__')
    target.mkdir(parents=True, exist_ok=True)
    for path in texts:
        shutil.copyfile(path, target / path.name)
    rows.append({'name': name, 'version': entry.get('version'), 'license': entry.get('license'), 'files': [str((target / p.name).relative_to(root)) for p in texts], 'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in texts}})
(out / 'INDEX.json').write_text(json.dumps(rows, indent=2) + '\n')
print(f'Collected license files for {len(rows)} runtime packages.')
