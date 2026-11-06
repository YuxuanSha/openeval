# OpenDesign attribution

This OpenEval frontend adapts neutral color tokens, shell proportions, composer layout, and conversation/artifact panel structure from OpenDesign, copyright its contributors, under its supplied license, labeled Apache License 2.0. The actual supplied text differs from the canonical Apache text in sections 6 and 9; it is retained verbatim here rather than silently substituted.

Upstream: https://github.com/nexu-io/open-design
Reference: tag open-design-v0.24.1, commit 89e64d813bb1c7a11519b3f668f011f7017637d7.
The previous development renderer derived from upstream markdown.tsx was replaced before the initial source release. The current Markdown.tsx is a new adapter around react-markdown and remark-gfm; no upstream parser is redistributed. Selected color declarations retain the source attribution below.

Referenced source: apps/web/src/styles/tokens.css; styles/home/entry-layout.css; styles/home/home-hero.css; components/EntryShell.tsx; EntryNavRail.tsx; ChatPane.tsx; router.ts.

Modifications: React components and styles rewritten for OpenEval's local Codex-only session API, versioned resources, evaluation skills, memory and artifacts. No OpenDesign branding, private artifacts, cloud/provider billing, fonts, or plugin templates are redistributed. The actual upstream license text is included as LICENSE, with the wording differences recorded below. This is an independent OpenEval interface, not an official OpenDesign distribution.

Recorded upstream wording differences: section 6 omits “reasonable and customary use in”; section 9 changes “Additional Liability”/“additional liability” to “Support”/“support”. This notice describes provenance and does not certify equivalence with canonical Apache-2.0.
