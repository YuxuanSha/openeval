# Portable OpenEval files

Use **文件分享** in the window header to export or import a `.openeval.json` file.
Select the exact resource snapshots and generated attachments to include, check
the file list, then download the package. For a Markdown report with relative
image links, select its corresponding image artifacts too. Send the resulting
file through your preferred channel. The recipient imports it into their own
OpenEval instance; this does not require the sender's machine or account.

The package contains original file bytes, names, selected version labels and
timestamps, content hashes, minimal dataset identity/record-field definitions,
and a SHA-256 manifest. Schema version 1 supports up to 200 entries and 32 MiB of
unique raw content. Packages use JSON and base64, so the downloaded file is larger.
Different files with the same package path must be exported separately.

Each import creates new resource IDs and local snapshots. Original version
numbers and timestamps remain in `metadata.share`; local version numbering starts
at 1. Editing an imported resource creates a new local version without inheriting
the original snapshot identity. Summary/full-source scoring restrictions are
preserved. Reimporting intentionally makes another copy. Dataset records are reparsed
using their original identity fields. Reports and scores are not recomputed.
Imported skills remain disabled until explicitly selected in a task.
Selecting a bundled skill also includes its declared relative attachments; these
appear in the review list. Uploaded Skill ZIPs retain their original archive and
are validated using the existing Skill parser (currently requiring Python 3).

Only explicitly selected snapshots and artifacts are included. Accounts,
credentials, chat messages, runs, events, memories, source URL metadata and
unselected files are excluded. Free text, embedded URLs and images inside the
selected files are preserved unchanged: review their content before sharing.
Known credential patterns block export/import, but this is not automatic
anonymization. Packages are not encrypted or signed. SHA-256 detects accidental
or unmatched edits; it does not authenticate the sender.

Import validates the schema, paths, sizes, file hashes and manifest before any
target-library write. It parses all resources in an isolated temporary store and
commits them together. A malformed dataset cannot leave a half-imported library.
Import never extracts package paths onto the filesystem, follows local paths,
fetches URLs, starts Codex or executes a skill. Relative PNG/JPEG/GIF/WebP images
included in the same package can be previewed inside imported Markdown reports.
Missing images stay unavailable. HTML, SVG and remote images are not enabled by
this preview feature. There is no online collaboration, live synchronization,
hosted share URL, or automatic recipient permission management.

## Local API for CLI and MCP integration

All endpoints use the existing loopback-only HTTP server and origin checks.

- `POST /api/shares/export`: `{ "projectId": "default", "versionIds": ["..."], "artifactIds": ["..."] }` returns the package JSON. Save it as a `.openeval.json` file. Both selection arrays are explicit; omitted arrays mean empty.
- `POST /api/shares/inspect`: `{ "package": { ... } }` returns the verified file list, total bytes, digest, warnings and `credentialRisk`. It does not import anything.
- `POST /api/shares/import`: `{ "projectId": "default", "package": { ... } }` returns `imported`, `versionIds`, an original-entry-key to local-version-ID `mapping`, the digest and `executionPerformed: false`.
- `GET /api/versions/:id/package-image?path=image.png` resolves a raster image from the imported package only. No remote lookup or filesystem traversal occurs.

The package has `format: "openeval.share"`, `schemaVersion: 1`, `producer`,
`createdAt`, `entries`, `blobs` and `manifestSha256`. Incompatible schemas fail
explicitly. Do not confuse this data format with the application distribution
manifest, and do not infer user authorization to send content from a valid hash.

## Application package verification

Build the frontend and run `npm run build:server`, then run `npm run package:local`. It creates a local
application directory under `release/` from an explicit input list and verifies
every manifest hash. It does not publish or install the application.

The recipient can run:

```sh
node scripts/verify-package.mjs /path/to/unpacked/openeval
```

The verifier rejects missing, changed, extra and symlinked files. Keep the supplied
LICENSE, LICENSES and third-party notices with the package. Node.js and Codex CLI
remain prerequisites; they are not bundled. Desktop signing/notarization and
platform support must be stated separately in the final release notes.

The macOS builder reads the display version from `package.json` (or
`OPENEVAL_VERSION`) and the build number from `OPENEVAL_BUILD_NUMBER`, falling back
to the numeric display version. It rejects an embedded `OPENEVAL_DESKTOP_DATA_DIR`,
audits the copied runtime, and checks Info.plist before signing. Keep development
data paths in the launch environment, not in a distributable application.
