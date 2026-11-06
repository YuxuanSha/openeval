# License scope and third-party notices

OpenEval's original code is licensed under the root MIT license. Third-party code
and notices listed here retain their original licenses. The root license does not
replace them or confer rights to user-supplied data, skills, reports or branding.

| Material | Version / provenance | Terms and retained text |
| --- | --- | --- |
| Selected color-token declarations in `web/src/styles/tokens.css` | OpenDesign `open-design-v0.24.1`, commit `89e64d813bb1c7a11519b3f668f011f7017637d7` | [Actual upstream license](web/third_party/opendesign/LICENSE), [source and wording differences](web/third_party/opendesign/NOTICE.md); do not substitute the canonical Apache text |
| Markdown rendering | react-markdown 10.1.0 + remark-gfm 4.0.1 | MIT; full texts and runtime transitive dependency notices in LICENSES/markdown-dependencies/ |
| React | 19.3.1 | [MIT](LICENSES/react-MIT.txt) |
| ReactDOM | 19.3.1 | [MIT](LICENSES/react-dom-MIT.txt) |
| scheduler | 0.28.0 | [MIT](LICENSES/scheduler-MIT.txt) |
| Lucide React, including its Feather-derived icons | 0.468.0 | [ISC and Feather MIT notices](LICENSES/lucide-react-ISC-Feather-MIT.txt) |
| MCP TypeScript SDK | @modelcontextprotocol/sdk 1.32.2 | [MIT](LICENSES/interface-dependencies/modelcontextprotocol-sdk-MIT.txt) |
| Interface validation | zod 3.25.76 | [MIT](LICENSES/interface-dependencies/zod-MIT.txt) |
| CLI schema discovery | zod-to-json-schema 3.25.2 | [ISC](LICENSES/interface-dependencies/zod-to-json-schema-ISC.txt) |

The OpenDesign attribution file is an OpenEval-authored notice, not an upstream
NOTICE file. OpenEval has no official affiliation with OpenDesign and does not
redistribute its logo, fonts, templates or desktop binary.

`web/package-lock.json` records build dependencies and their declared licenses.
Codex CLI, browsers, development tools, and `node_modules` are not included in the
desktop application. The optional macOS arm64 distribution includes the official
Node.js 24.22.1 executable, unchanged. Its complete upstream license (including
third-party notices) is retained in `Contents/Resources/Node-LICENSE.txt`, with
archive and executable hashes in `Contents/Resources/node-provenance.json`.
Node.js core is MIT; its bundled dependencies retain the terms in that full text.
Source-only builds can still use an external Node installation. The local compiled
UI package includes the above runtime license texts and this index.

The CLI/MCP npm archive contains compiled OpenEval backend code and generic skills.
Its npm dependencies are installed separately from the pinned root
`npm-shrinkwrap.json`; their packages retain their respective license files.
TypeScript and Node type definitions are build dependencies, not bundled runtimes.

Default built-in skills describe generic evaluation methods and synthetic examples.
Original private workflows, user-uploaded skills and historical cases are not
included in source or application packages; they carry no grant from this license.

The current Markdown adapter is independently implemented over MIT-licensed libraries. The earlier development copy of the OpenDesign parser is excluded from source and application packages.
