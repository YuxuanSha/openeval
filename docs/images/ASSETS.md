# Visual assets

The English README uses English graphics. The Chinese README uses corresponding Simplified Chinese hero, workflow and architecture graphics; product and protocol names retain their original spelling.

## Hero

`hero-v2.png` and `hero-mobile-v2.png` are original AI-assisted brand illustrations made with the built-in image-generation tool. The exact underlying model identifier was not exposed by the tool; these files are **not attributed to a specific “image2.5” model**.

The concept is an evidence workspace: three independent material paths converge on a shared document platform. Matte archival paper, graphite frames, and a restrained green route connect the visual to versioned context and traceable work. It is an illustration, not a product screenshot, architecture guarantee, or report of a completed run.

The portrait image was recomposed through image generation from the desktop artwork. Neither image was programmatically retouched. Source outputs remain intact in the authoring environment.

## Chinese hero localization

`hero.zh-CN.png` and `hero-mobile.zh-CN.png` are text-localized counterparts of the existing wide and portrait English illustrations, made with the built-in image-generation tool. The original architectural scene, palette and typography hierarchy were preserved. The exact localization copy is: “Codex 驱动的评测工作台”, “OpenEval”, “把评测工作，放进一个工作区。” and “版本可追溯 · 执行有证据”. These are brand illustrations, not screenshots; no new product capability is implied. The tool did not expose a verifiable underlying model identifier. The original English files remain unchanged.

## Workflow

`workflow-v2.svg` and `workflow-mobile-v2.svg` are editable, English-only workflow illustrations. Their PNG counterparts are deterministic browser renders. The diagrams show independent entry points feeding shared context and CLI execution, with reports produced when requested and the user's selected template taking priority.

`workflow.zh-CN.svg` and `workflow-mobile.zh-CN.svg` translate the existing editable diagrams directly into Chinese, retaining the same independent task paths, version bindings and acceptance boundary. They are embedded as regular vector images.

SVGs contain project-authored text and simple vector geometry, with no external image links, embedded font files, or scripts. System font fallbacks are used. No third-party logo is included.

## Architecture

`architecture.svg` and `architecture.zh-CN.svg` are project-authored, editable English and Chinese architecture diagrams. Each README embeds its matching language version as a regular image so it does not depend on GitHub's Mermaid renderer. It preserves the local UI, Node.js service, SQLite/files, Codex CLI and OpenAI model-service connections, and explicitly marks the local/cloud boundary. The SVG contains only text and vector geometry; it has no scripts, embedded fonts or external resources.

## Publishing

The README uses `<picture>` to select the mobile composition at narrow widths and includes text alternatives. No Chinese interface screenshots are distributed in this image set; the original development screenshots remain unchanged outside this package.

Image copy should remain distinct from current validation status and license terms. Do not add score claims, CI badges, an MIT badge, or an assertion of a public release before those facts are established.
