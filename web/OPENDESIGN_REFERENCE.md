# Design reference and implementation boundary

Reference: [OpenDesign open-design-v0.24.1](https://github.com/nexu-io/open-design/tree/open-design-v0.24.1), commit `89e64d813bb1c7a11519b3f668f011f7017637d7`.

OpenEval refers to the upstream entry shell, recent conversation rail, composer,
neutral palette and conversation/artifact split. Its session, library, evaluation,
resource-version and memory components are implemented against OpenEval's own API.
The upstream EntryShell or ChatPane was not transplanted wholesale.

| Upstream reference | OpenEval implementation |
| --- | --- |
| `components/EntryShell.tsx`, `EntryNavRail.tsx` | New-task creation, persisted recent sessions, local runtime status |
| `styles/home/entry-layout.css`, `home-hero.css` | Neutral shell, compact controls and centered composer |
| `styles/tokens.css` | Selected neutral color declarations; original source attribution retained |
| `components/ChatPane.tsx`, `router.ts` | Conversation/artifact split and canonical task URL |

A development version used the upstream Markdown parser. Before initial release,
that copy was replaced with an independently implemented adapter over react-markdown
10.1.0 and remark-gfm 4.0.1 (MIT). No upstream Markdown parser is included in the
release tree. Table, link, code, HTML/URL safety and long-document behavior have
separate rendering checks.

The [actual upstream license](third_party/opendesign/LICENSE) is retained verbatim
for selected color declarations. Its text is labeled Apache-2.0 upstream but differs
from the canonical license in sections 6 and 9; the [notice](third_party/opendesign/NOTICE.md)
records those differences and modifications. OpenEval does not silently substitute
a different license text or represent the supplied text as canonical Apache-2.0.

No OpenDesign branding, font files, private screenshots, templates, or desktop
binaries are redistributed. OpenEval is an independent project.
