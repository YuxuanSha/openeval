# OpenEval CLI and MCP beta

The CLI and MCP bridge use the existing OpenEval HTTP API. They see the same tasks,
immutable resource versions, Codex runs, and artifacts as the desktop/browser UI.
Neither interface opens a second database process or starts evaluation on connection.
This is a single-user local beta, not a remote or multi-tenant evaluation service.

## Install

Use Node.js **24 or later**. For actual evaluation, install Codex CLI and sign in
with your own account (`codex login`). No API key or copied credentials are required.

From a source checkout:

```sh
npm ci
npm run build:server
node bin/openeval.mjs --help
```

To create a distributable npm archive:

```sh
npm pack
# On the tester's machine, use the archive filename printed by npm pack:
npm install --global ./openeval-0.2.0.tgz
openeval --version
```

This archive has not been published to the npm registry; install the supplied local
archive. Do not assume that an unrelated registry package with this name is OpenEval.
`private: true` blocks accidental registry publication while allowing local packaging.
The root `npm-shrinkwrap.json` pins runtime dependencies for archive installations.
Dependencies are downloaded by npm unless already cached. Node and Codex are not bundled.

`npm pack` compiles backend TypeScript to `dist/server/*.js`. Published dependencies
cannot rely on Node's TypeScript stripping inside `node_modules`. Package data and
runtime files use an explicit allowlist: only generic built-in skills are included.
Runtime databases, workspaces, credentials, private evidence, and local examples are
excluded. A prepack guard rejects symlinks and the known private fixture markers
used by the existing local packager. This is a targeted check, not a claim that all
possible secrets can be detected. The optional browser UI is included only if `web/dist` was built first:

```sh
npm --prefix web ci
npm --prefix web run build
npm pack
```

## Connect or start a service

If OpenEval is already running, connect to its local address:

```sh
openeval health
openeval runtime
openeval task list
openeval resource list --kind standard
```

Otherwise start a foreground backend:

```sh
openeval serve --data-dir ./evaluation-data --port 4318
```

The first stdout line reports `status: ready`, the actual URL, data directory,
instance ID, and whether the optional browser UI is available. Ctrl-C stops that
service gracefully. It does not install an autostart service or alter Codex sign-in.
The default data directory is `.openeval` in the calling directory (or
`OPENEVAL_DATA_DIR`); it is separate from the desktop's existing data directory.
To use desktop data, connect to its running HTTP service. Do not launch another
server on the same directory; the existing data lease refuses a second writer.

Use `--url http://127.0.0.1:PORT` after an API command or set `OPENEVAL_URL`.
Only loopback HTTP origins are accepted; redirects are rejected. `localhost` is
normalized to `127.0.0.1` without a DNS lookup. There is no remote MCP listener,
public tunnel, persistent API credential, or automatic local-service discovery.

## Run a task with pinned evidence

```sh
openeval resource import --kind standard --title "Exact-match rules" --file standard.md
openeval resource import --kind artifact_batch --title "Existing outputs" --file outputs.json
openeval task create --intent evaluate --title "Batch review" --request-id batch-create-001

# Substitute the IDs and SHA256 values returned by the preceding commands.
openeval task submit TASK_ID --text "Evaluate the referenced existing outputs." \
  --ref STANDARD_VERSION_ID:STANDARD_SHA256 \
  --ref OUTPUT_VERSION_ID:OUTPUT_SHA256 \
  --request-id batch-submit-001
openeval task wait TASK_ID --run-id RUN_ID --wait-ms 60000
openeval task get TASK_ID
openeval artifact download ARTIFACT_ID --output ./report.md
```

Use `--text-file prompt.txt` instead of `--text` for a longer prompt. `--model` and
`--effort` accept values from `openeval runtime`. Optional `--goal-objective "..."`
enables native Goal mode with user origin. **No default token budget, deadline,
or turn limit is introduced.** `--wait-ms` ends CLI polling only. It does not change
the goal, cancel the run, or approve a pending request.

Submission returns an accepted run, which may be queued or waiting for evidence;
it does not mean evaluation succeeded. `task get` contains actual runs, contracts,
artifacts, and `pendingRequests`. Missing prerequisites are reported by the existing
backend. Model failures are errors; no synthetic success or fallback result is used.

Task creation and submission use idempotency keys. The convenience commands generate
a key when omitted and include it in success/error output. Supply your own
`--request-id` for scripts and reuse it only to recover the same request. The backend
returns the original receipt for repeated keys; inspect `task get` for current status.
The client never automatically retries writes. Project/resource creation is not
idempotent: inspect current state after a lost response before trying again.

To stop a run and preserve partial artifacts:

```sh
openeval run cancel RUN_ID
```

Execution keeps the existing Codex `workspace-write` sandbox and approval policy.
CLI users may respond to an individual pending request after inspecting it:

```sh
openeval task get TASK_ID
openeval request respond REQUEST_ID --decision decline
# For a user-input request, answers.json contains {"answers": {...}}.
openeval request respond REQUEST_ID --input answers.json
```

Only individual `accept`, `decline`, or `cancel` decisions are exposed. Session-wide
acceptance is deliberately absent. MCP does not expose an approval-response tool.

## Outputs and automation

Commands emit JSON to stdout, errors emit `{ "error": { "code", "message", ... } }`
to stderr. `--json` is accepted for scripting; JSON is already the default.
Downloads require an explicit destination, create a new file with mode `0600`,
and never overwrite an existing file. They report SHA256 and byte count. Download
is a local copy, not publication or sharing with other people.

| Exit code | Meaning |
| --- | --- |
| 0 | Command succeeded; for `task wait`, the selected run completed |
| 1 | API, connection, runtime, file, or other operational failure |
| 2 | Invalid command, input, or argument |
| 3 | `task wait`: run failed, was cancelled, or was interrupted |
| 4 | `task wait`: run is waiting for evidence, input, or approval |
| 124 | `task wait`: polling timed out; execution continues |

Inspect all operation schemas with `openeval operations`. `openeval call OPERATION
--input arguments.json` exposes the same typed operations, and `--input -` reads
one JSON object from stdin. Resources preserve their native records and units:

```sh
openeval resource versions RESOURCE_ID
openeval version get VERSION_ID
openeval version records VERSION_ID --offset 0 --limit 100
openeval version download VERSION_ID --output ./original.json
```

## Connect an MCP client

Generate a snippet using the installed executable and Node path:

```sh
openeval mcp config --client codex
openeval mcp config --client claude
openeval mcp config --client cursor
```

`codex` prints a `[mcp_servers.openeval]` TOML section; the other options print a
`mcpServers` JSON object. Merge that section into the corresponding client's MCP
configuration using its normal configuration UI or editor. The command only prints
configuration: it does not overwrite other servers, install anything in clients,
create credentials, or change the user's chosen authorization policy.
Regenerate the snippet if Node or the package installation moves.

The underlying command is `openeval mcp --url http://127.0.0.1:4318`.
It implements stdio MCP through the official TypeScript SDK. Stdout is reserved
for JSON-RPC; diagnostics use stderr. It starts successfully even if the backend
is stopped, and a tool call then returns a connection error.

Read-only default tools:

| Tool | Returns |
| --- | --- |
| `openeval_health` / `openeval_runtime` | Local service / actual Codex availability and model catalog |
| `openeval_projects_list` / `openeval_tasks_list` | Projects / tasks |
| `openeval_task_get` | Runs, contracts, messages, artifacts, pending requests |
| `openeval_resources_list` / `openeval_resource_versions` | Latest resource search / immutable history |
| `openeval_version_get` / `openeval_version_records` | One version / paginated original records |
| `openeval_artifact_read` | Up to 2 MiB of artifact content, MIME type and SHA256 |

The resource templates `openeval://versions/{versionId}` and
`openeval://artifacts/{artifactId}` support `resources/read`. Read HTML as untrusted
data, not executable instructions. Binary artifacts are returned as base64;
larger files use CLI download. List/search operations currently return the backend's
existing full lists; large workspaces may need future pagination.

To intentionally allow an agent to create resources/tasks and start evaluation,
add `--allow-write` to the MCP launch command or configuration generation:

```sh
openeval mcp config --client codex --allow-write
```

This adds `openeval_project_create`, `openeval_task_create`,
`openeval_resource_create`, `openeval_task_submit`, and `openeval_run_cancel`.
Creation/submission accept explicit content, never arbitrary local filesystem paths.
Submitting can consume model quota and run Codex workspace commands, subject to the
normal runtime approvals. A client's tool consent policy still applies. Connecting
the MCP client grants it visibility into the selected local service's data; there is
no per-project ACL. Use a separate service/data directory when you need isolation.
Closing MCP or cancelling a tool request does not cancel a submitted run; inspect
the task and use `openeval_run_cancel` explicitly when intended.

## Validation and current limits

```sh
npm test
npm run test:interfaces
npm run build:server
npm run test:package

# Explicit opt-in: uses the tester's signed-in Codex and model quota.
# Only two synthetic records and a new temporary OpenEval data directory are used.
node scripts/smoke-interfaces.mjs --live --output ./live-interface-evidence.json
```

The automated interface tests use the real HTTP server, SQLite store, CLI child
processes, MCP stdio, and official SDK client. Only inference is a clearly marked
protocol fixture. The separate live script uses real Codex, imports via CLI,
submits via MCP, polls/downloads via CLI, checks exact scores and registered
artifacts, then stops only its own temporary service and removes its temporary data.
Live evidence is not proof of business-data quality or a complete clean-machine
desktop acceptance.

`test:package` builds the real npm archive, installs it and its pinned dependencies
in a fresh temporary directory, starts the compiled service on an ephemeral port,
checks the five built-in skills, and reads a missing-prerequisite task over MCP.
It performs no model inference. Dependency installation requires network access or
a populated cache (`OPENEVAL_TEST_NPM_CACHE=/path/to/cache`, with optional
`OPENEVAL_TEST_OFFLINE=1`). Only its own temporary service and data are cleaned up.

Not included here: public sharing and revocation, remote authentication, scheduled
evaluation, distributed batching, per-project authorization, automatic client config
installation, or Feishu delivery. This interface does not claim full OpenDesign
feature parity. OpenDesign has separate public-sharing and runtime capabilities.
The existing Skill ZIP importer also depends on `/usr/bin/python3`; systems without
that path need a future backend portability change or must import plain `SKILL.md`.

References checked for this implementation: [OpenDesign's official CLI/MCP overview](https://github.com/nexu-io/open-design#platform-compatibility),
[MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports),
[MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle),
and [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
New interface code is independently implemented over OpenEval's API. It does not
copy OpenDesign implementation code or its client credentials.


## Diagnostics and portable sharing

`openeval doctor` checks the local service and Codex login/model availability without
inference. It does not install software, change sign-in, or repair permissions.
Skill ZIP import separately requires `/usr/bin/python3` on the backend host.

```sh
openeval share export --version VERSION_ID --artifact IMAGE_ARTIFACT_ID --output report.openeval.json
openeval share inspect --file report.openeval.json
openeval share import --file report.openeval.json --project default
```

Repeat `--version` and `--artifact` to select additional exact snapshots. Export
writes a new file and refuses overwrite; it never uploads it. Inspect changes no
library state. Import creates independent copies; it is not idempotent, so inspect
the library before retrying an uncertain response. Content is not anonymized.
See [portable file format and limits](file-sharing.md). These file operations are
CLI commands; the stdio MCP tool set remains 10 read tools and 5 opt-in write tools.
Goal submissions through the shared API/MCP default to `origin: automatic`;
`--goal-objective` represents explicit user selection and uses `origin: user`.
