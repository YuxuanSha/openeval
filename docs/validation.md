# Validation scope

This document records checks through 2026-11-05. Protocol checks, synthetic model tasks, and business-workflow acceptance are separate evidence categories. Earlier counts below describe their original snapshots, not the current aggregate.

| Layer | Recorded evidence | Scope |
| --- | --- | --- |
| Backend checks | 52 checks and TypeScript validation passed | Session idempotency, versions, batches, templates, memory scope, ZIP validation, link failures, approvals, cancellation, process failure, and restart behavior. |
| Frontend protocol checks | 31 adapter checks and a production build passed | Request/event mapping, fixed references, persistence, execution, and goal state. These fixtures do not invoke a model. |
| Real CLI, synthetic tasks | Standard construction, same-thread continuation, a selected report template, synthetic text evaluation, and existing-score analysis | Small workflows execute through the real CLI. Existing-score analysis preserved the original batch hash without creating a new score batch. |
| Cancellation and Skills | An interrupted real CLI run retained partial artifacts; a selected ZIP Skill used its relative attachment | Native cancellation, thread continuation, and selected bundle mounting. |
| Native goals | A synthetic two-stage task completed two native turns and retained checkpoint/final files | Native continuation works in that task. Independent acceptance remained `not_checked`; budget-limited interruption was tested separately. |
| Actual interface | Session creation, recents, reload/drafts, versions, records, results, templates, Skills, memory, and execution replay | Actual frontend/backend interaction and a 390 × 844 mobile layout check. |
| Local process lifecycle | Six isolated checks, with no model calls | Detached operation, repeated starts, identity checks, graceful stop, and restart without rerunning tasks. |

**Integrated acceptance:** a five-submission browser workflow completed in one native Codex thread: standard → separate dataset/output versions → two existing-output judgments → template-preserving report. Backend readback confirmed two records per batch, one scoring batch, preserved prior snapshots, and no scoring during report writing. See [the reproducible example](examples/synthetic-echo.md). Eight renderer checks cover tables, links, code, unsafe HTML/URLs, and long reports.

**Still pending:** accepted in-product Feishu export and clean-machine distribution. A subsequently authorized small image workflow completed scoring and local reporting. Its private materials are excluded from the repository; this is execution evidence, not a judge-accuracy benchmark.

## November 4 review

See [findings and diagnostic matrix](review-2026-11-04.md). Twelve checks exercised seven newly authored synthetic records through real Codex CLI scoring, template reporting and analysis. A separate real native-goal test cancelled an active goal and resumed the same thread in single-turn mode. Eleven isolated Chrome checks and six process lifecycle checks passed. These deterministic fixtures do not measure business accuracy, subjective quality, judge agreement, or multimodal quality. Mounted-input hash verification was also tested against both tampering and a normal real CLI report turn.

## Visual evidence

The current product interface is Chinese. Original screenshots use clearly labeled synthetic materials and are retained in development evidence. This English README does not replace their text with AI-generated translations or present a conceptual image as an actual interface screenshot.

Public README graphics are English-language brand and workflow illustrations. They contain no user cases, personal document links, credentials, invented scores, or acceptance badges.

## Repeatable code checks

```sh
# Backend: Node.js 24+
npm test

# Frontend: Node.js 22.12+
npm --prefix web run test:adapter
npm --prefix web run build
```

These commands validate code and protocol behavior. They do not launch the private business batch. Real model tasks require a working CLI session, specified material, and the appropriate task scope.

## Native macOS application

The local AppKit/WKWebView build starts and owns its localhost backend. Earlier native UI checks covered Finder launch, quitting and reopening without rerunning tasks, preserved data, the six navigation sections, import validation, native file selection, CSV pagination and version switching, fixed references, model/effort menus, task examples, Skills, memory creation/editing, artifact previews and original downloads. The lightweight composer replaces the settings dialog. Existing memory scope is explicitly fixed in the editor.

A real CLI task created a synthetic standard and registered it. A second native goal created a tiny synthetic PNG and a Markdown note, completed one turn, and reported a null token budget with no harness deadline or turn cap. Goal completion remains separate from product validation. A third native task checked installed CLI help only; that does not prove Feishu authentication, document access from the agent, or image evaluation quality.

Five backend process tests cover desktop shutdown, stdin closure, data reopening, port conflicts and second-writer refusal. The final native build is ad-hoc signed, not Developer ID signed or notarized. The localhost app has been run on the development Mac; this is not a signed distribution claim.

Native deletion of the self-authored QA memory removed it from the active list, remained removed after reload, and preserved its history. There is no native restore UI. Coverage remains limited for native approval/input-request dialogs, minimum-size window layout, and failed download recovery. These are not claimed as fully exercised merely because protocol tests pass. Personal Feishu report creation/readback remains blocked on the destination identity check.

## November 5 integration

- 86 backend tests passed, including sharing hash validation, restrictive metadata preservation, edited-version provenance, image URL decoding, record copying beyond one million rows, case-insensitive Skill path collision rejection, and read-only workspace validation.
- Frontend checks passed: 33 adapter checks, seven execution-state checks, eight Markdown checks, type checking and production build. The revised trace uses a compact elapsed-time control, inline commentary, and grouped tool rows.
- An actual npm archive installed in a new temporary directory and ran its compiled JavaScript backend. CLI export/inspect/import preserved original bytes and scores. MCP exposed ten read-only tools by default; write access is explicit. No model inference was performed by this package test.
- A separate real CLI/MCP synthetic two-record workflow produced scores and a report, registered them, and verified downloaded hashes. It used invented text and is not a business-quality test.
- Native WKWebView checks covered the selected green e icon in Finder, file selection, share preview/import, report tables and images, exact-file export, quitting and reopening. A manually seeded 250-step trace exercised search and the full-output control; it was not a model run.
- The workspace-selection menu rejects invalid directories, opens an existing workspace without moving data, and retains the selection after restart. Saved business run states and artifact hashes remained unchanged; no evaluation was rerun.
- Native trace checks used an explicitly isolated in-memory fixture, not a model: collapsed approval visibility, decline advancing to queued input, explicit input submission, all 250 tool rows through pagination, full 32,019-character output rendered through its tail marker, and Escape/Enter focus behavior. A screenshot was saved through the native Save panel. The same frontend assets were packaged into the actual application, whose Finder launch, quit/relaunch, historical trace and report reopening passed separately.

Remaining distribution gates include Dock icon confirmation, downloaded-app Gatekeeper behavior, other Mac/Intel machines, and clean-machine Node/Codex/Python dependencies. Live approval execution and failed-download recovery were not comprehensively exercised. An OS-style floating tooltip was not reproduced as an app defect; its root cause is not claimed fixed. The app is ad-hoc signed and has not been notarized. Portable files are supported; hosted public links, publish/revoke, and cloud sharing are not implemented.

The first final-build Finder launch was blocked in `getcwd` while macOS TCC requested Documents-folder access. A later read-only inspection of System Settings showed that access was enabled; the agent did not change the switch. Normal Retry then succeeded. After Cmd-Q, an actual Finder double-click started a new backend instance, preserved all nine existing tasks, and did not rerun them. A new, self-authored text-only CLI smoke test completed in one turn with no artifacts or errors. The final memory editor's fixed-scope explanation was also verified in this native build. No TCC configuration was changed or bypassed.
