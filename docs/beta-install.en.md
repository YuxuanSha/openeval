# OpenEval 0.2.0 · build 11 r1 beta

This local desktop build is for **Apple Silicon, macOS 13.5 or later**. Revision r1 bundles official Node.js 24.22.1; the evaluation core and trace v2 remain on the build 11 baseline. Intel, Windows and Linux are not supported by this package.

## Install

1. Extract the ZIP. Check `BUILD.json`, `VALIDATION.txt` and the accompanying ZIP SHA256 checksum if needed.
2. Copy `OpenEval.app` into your Applications folder, or try it from the extracted directory. Quit and retain any existing version before replacing it. Do not merge application bundles.
3. Double-click the app. Its own window manages the local backend; no browser or manual server command is required.
4. For evaluation, install Codex CLI following [OpenAI's instructions](https://learn.chatgpt.com/docs/codex/cli), run `codex` once and sign in with your own ChatGPT account, then reopen OpenEval. An API-key-only login is not used. Local resource browsing/import works without model execution.

**The app has an ad-hoc signature, not a Developer ID signature, and is not notarized.** Gatekeeper may block downloaded copies. A matching checksum is not notarization. If macOS blocks the app, retain the exact message and contact the maintainer or wait for a signed/notarized build. Do not disable Gatekeeper, strip quarantine flags or grant Full Disk Access to work around it.

## Data and shutdown

Data defaults to `~/Library/Application Support/OpenEval/data`. Use the Window menu to show this folder or select an existing workspace containing `openeval.sqlite` and `blobs`. No data is merged or moved. Quit with Command-Q or close the last window; active work stops and saved outputs remain. Reopening does not rerun evaluations. Before upgrading, quit and back up the whole data directory and retain the old app. Removing the app does not delete data.

The backend binds only to `127.0.0.1:4318`. Port or workspace conflicts are reported without killing another owner. Logs are under `desktop-logs/window.log` in the data directory; review them for private content before sending feedback.

## Dependencies and limits

- Node is bundled; opening the app requires no ChatGPT installation, npm or Xcode. The bundled executable is not installed globally. Codex and its login are separate, user-managed dependencies.
- Model requests go through the local Codex CLI to OpenAI. This is not offline model inference. Feishu and other integrations require the tester's own authorized connections.
- Skill ZIP import currently needs `/usr/bin/python3`; on a Mac without it, use a standalone `SKILL.md` instead. Offline `.openeval.json` sharing does not need Python.
- Use File sharing to select versions/attachments, inspect, and download `.openeval.json`; recipients inspect and confirm import in the same dialog. This is an offline JSON content package, not an application installer or hosted public link. Imported skills do not execute automatically.
- CLI/MCP is distributed as a separate npm archive, not installed by this ZIP. There is no auto-updater or public sharing host.
- Same-Mac isolation checks do not establish clean-Mac or downloaded/quarantined Gatekeeper compatibility. See `VALIDATION.txt` for tested and untested cases. macOS 13.5 is the runtime's declared minimum, not a tested machine in this release.

OpenEval's original code uses MIT. Third-party terms and OpenDesign provenance remain under `Contents/Resources/runtime/`; Node's complete license and byte hashes are in `Contents/Resources/Node-LICENSE.txt` and `node-provenance.json`. No user data, account credentials or private evaluation history is included.
