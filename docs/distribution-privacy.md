# Distribution privacy review

The published repository and macOS distribution were checked on 2026-11-06.
The review found no user credentials, private document links, personal work
directories, business input samples, saved evaluations, local conversation
history, runtime databases or account state in the reviewed distribution.

## What was checked

- The complete published Git history and all advertised branches/tags, rather
  than just the latest README. Local development history was not imported.
- The source snapshot, its later documentation/packaging changes, tests and five
  generic built-in skills. Tests use synthetic inputs; the default skills are
  generic methods, not copied private case libraries.
- README illustrations, editable diagrams and PNG metadata. The published
  illustrations do not contain user interface captures, private links or cases.
- Every entry of the original r1 ZIP, including the native executable and bundled
  Node runtime. The r2 DMG retains all 164 application files byte-for-byte; only
  the container, Finder layout and installer background are new.
- Release text and attached filenames/checksums. At review time there were no
  Issues, PRs or Actions run logs exposing additional project material.

The current source passes `node scripts/release-audit.mjs --tree <export>`.
Additional byte scans covered binaries, documents and image metadata. Potential
credential matches inside the unchanged official Node executable were encoded
vendor data, not user secrets; its hash matches the pinned upstream executable.
Vendor build paths are upstream metadata, not this project's authoring paths.

## Intentionally retained

Repository-owner attribution, GitHub noreply commit metadata, copyright notices,
third-party licenses, public upstream URLs, synthetic fixtures and the five
generic skills remain. The privacy review does not remove attribution required
by those licenses or claim that every string is anonymous.

No user-provided installation screenshot, diagnostic screenshot, original
business material or local audit workspace is committed. `.gitignore` excludes
runtime stores, credentials, private imports, local evidence and release folders.
Public release assets are selected separately after inspection.

This is a scoped source/history/package review, not a guarantee that a pattern
scanner detects every possible secret. It does not establish model accuracy,
Apple notarization or clean-machine compatibility. User-created workspaces,
logs and exports still need their own review before sharing.
