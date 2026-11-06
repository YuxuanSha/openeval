# macOS DMG candidate — signing blocked

The DMG packaging work is complete, but this is **not a fix for Gatekeeper**
and has not passed normal downloaded-app launch acceptance.

## Confirmed diagnosis

The reported alert says Apple cannot verify whether OpenEval contains malicious
software. The build-11-r1 application passes `codesign --verify --deep --strict`,
but is only ad-hoc signed. `spctl --assess --type execute` rejects it. There is no
Developer ID signature or Apple notarization ticket. Changing ZIP to DMG does
not establish either one. See [Apple's explanation](https://support.apple.com/en-us/102445).

## Prepared DMG

- The Finder window contains only `OpenEval.app` and an `Applications` shortcut,
  with a drag-to-install arrow and English/Chinese instructions.
- The application is copied byte-for-byte from the existing r1 ZIP, including its
  bundled Node.js 24.22.1 runtime, generic skills and third-party notices.
- No account, user data, screenshots, local log or evaluation material is added.
- The new packaging does not remove quarantine attributes, add a Gatekeeper
  exception, change system protections, or make the app notarized.

The disk image passed `hdiutil verify`, mounted read-only, and its application
matched all 164 files of the r1 application. Finder's drag-to-install layout was
visually inspected. These are local packaging checks, not a clean-Mac or
downloaded-app acceptance result. Installation, successful launch and reopen
acceptance remain blocked on signing/notarization; they are not claimed passed.

## Reproduce the package

Use a dedicated Python 3.10+ environment with `dmgbuild==1.6.7`. The tool is a
build dependency only, not part of the app runtime. From the repository root:

```sh
OPENEVAL_DMG_PYTHON=/path/to/venv/bin/python \
  bash scripts/package-dmg.sh /path/to/OpenEval.app /path/to/OpenEval.dmg
```

The script refuses to overwrite an existing image, checks the application
signature's integrity, creates the Finder layout and validates the disk image.
An integrity check is not a Developer ID trust assessment.

Before promoting this candidate, configure a valid Developer ID Application
identity, sign all executable components as required, submit the distribution to
Apple's notary service and staple the accepted ticket. Then download the actual
published bytes through a browser and test mounting, copying, normal launch and
reopening without changing security settings. Test on a separate clean Mac as
an additional acceptance gate. Preserve existing apps and user workspaces.

The r1 Release and its checksums remain unchanged while this gate is unresolved.
