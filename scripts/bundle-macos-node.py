"""Copy only a pinned official Node executable and its full license into an app.

Download the archive separately from the recorded HTTPS URL. This helper never
installs dependencies, changes credentials or extracts untrusted archive paths.
"""
import hashlib
import json
import pathlib
import platform
import sys
import tarfile

VERSION = '24.22.1'
ARCHIVE = 'node-v24.22.1-darwin-arm64.tar.gz'
SHA256 = '89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7'


def bundle(archive, app):
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise ValueError('This distribution supports only Apple Silicon macOS')
    if archive.is_symlink() or not archive.is_file():
        raise ValueError('Node archive must be a regular file')
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Official Node archive SHA256 mismatch')
    targets = {
        ARCHIVE[:-7] + '/bin/node': app / 'Contents/Frameworks/node',
        ARCHIVE[:-7] + '/LICENSE': app / 'Contents/Resources/Node-LICENSE.txt',
    }
    provenance_path = app / 'Contents/Resources/node-provenance.json'
    if any(p.exists() or p.is_symlink() for p in [*targets.values(), provenance_path]):
        raise ValueError('Refusing to overwrite an existing bundled runtime')
    with tarfile.open(archive, 'r:gz') as source:
        contents = {}
        for name in targets:
            matches = [m for m in source.getmembers() if m.name == name]
            if len(matches) != 1 or not matches[0].isfile():
                raise ValueError('Official runtime entry is missing, repeated or unsafe')
            contents[name] = source.extractfile(matches[0]).read()
        # Fixed destination names; never use extractall or member paths as output.
        for name, target in targets.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(contents[name])
            target.chmod(0o755 if name.endswith('/bin/node') else 0o644)
    provenance = {
        'name': 'Node.js', 'version': VERSION, 'architecture': 'arm64',
        'minimumMacOS': '13.5',
        'source': 'https://nodejs.org/dist/v' + VERSION + '/' + ARCHIVE,
        'checksumSource': 'https://nodejs.org/dist/v' + VERSION + '/SHASUMS256.txt',
        'archiveSha256': SHA256,
        'verification': 'Pinned SHA256 matched official HTTPS checksum; no independent release-key verification',
        'modifications': 'None; executable and full LICENSE copied byte-for-byte',
        'files': [{'path': str(p.relative_to(app)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in targets.values()],
    }
    provenance_path.write_text(json.dumps(provenance, indent=2) + '\n')
    print('Bundled official Node.js ' + VERSION + ' (arm64), archive SHA256 verified')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: bundle-macos-node.py <official.tar.gz> <output.app>')
    bundle(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
