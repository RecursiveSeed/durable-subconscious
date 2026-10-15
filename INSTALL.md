# Installation and configuration

## Normal developer experience

**Install once → Give the AI one setup prompt → Let the AI maintain relevant
knowledge during development.**

The setup session initializes project-local knowledge from available evidence and
installs persistent project instructions for the selected agent. Later sessions
are intended to consult that knowledge before relevant work, verify its freshness,
and update affected memories after verified changes. During normal supported-agent
operation, the developer does not repeat setup or manually edit graph nodes and
relationships. The package runs locally without a required cloud service.

Automatic maintenance depends on the agent loading and following its installed
instructions. Codex is independently verified across fresh sessions; Claude Code,
Cursor, GitHub Copilot, Gemini CLI, and OpenCode are adapter-tested but remain
actual-agent-session **UNVERIFIED**. External source changes, missing evidence, or
unresolved relationships can require explicit review and reconciliation. The
advanced commands below remain available for those cases, core-only use, recovery,
and troubleshooting.

## Requirements

- Node.js 20 or newer
- A writable project directory
- npm for the supported project-local installation
- One supported coding agent for persistent automatic integration, or no agent for
  core-only use

The package has no runtime dependencies, build step, native module, service,
credential, or network call after installation.

## Project-local installation

From the target project:

```sh
npm install --save-dev github:RecursiveSeed/durable-subconscious
```

For development from a checked-out copy, npm can install the local directory:

```sh
npm install --save-dev /absolute/path/to/durable-subconscious
```

Both forms place the executable in the project's normal npm command path. Use it
without downloading or falling back to a global package:

```sh
npx --no-install durable-subconscious help
```

## One-prompt agent setup

Give a fresh supported agent session the exact setup prompt published in
`README.md`. That session identifies itself and runs, for example:

```sh
npx --no-install durable-subconscious setup . --agent codex
```

Accepted identifiers are `codex`, `claude`, `cursor`, `copilot`, `gemini`, and
`opencode`. An optional `--agent auto` succeeds only when one environment is
unambiguously detectable; use an explicit identifier for predictable automation.

The command performs two bounded operations:

1. Atomically creates `.durable-subconscious/` when it is absent. Existing project
   knowledge is never reinitialized.
2. Creates or refreshes one managed Durable Subconscious block in the selected
   agent's documented project instruction file. Existing content remains outside
   the block.

Repeated setup is idempotent. It installs no unrelated agent instruction files.
The canonical workflow remains `.durable-subconscious/agent-guide.md`; adapters do
not copy or fork its requirements. See `docs/COMPATIBILITY.md` for the distinction
between independently verified and documented-but-unverified environments.

During the first session, the setup agent follows that guide to inspect project
evidence, build the initial map, run relevant tests and validation, and establish
the reviewed freshness baseline. The developer is not expected to hand-author the
schema as part of normal setup.

## Upgrade from v0.3 or v0.4

Those packages predate the updater, so first install v0.5 with the existing npm
method:

```sh
npm install --save-dev github:RecursiveSeed/durable-subconscious#v0.5.0
```

Then review and apply the one-time bootstrap, substituting the actual prior
version and selected agent:

```sh
npx --no-install durable-subconscious update --project . --bootstrap-from 0.4.0 --agent codex
npx --no-install durable-subconscious update --project . --bootstrap-from 0.4.0 --agent codex --apply
```

The bootstrap preserves knowledge and custom instructions, refreshes managed
requirements, and records the installed version. It does not reconcile evidence;
missing freshness remains unknown and stale evidence remains stale.

For later supported releases, discover the latest stable version, then plan and
apply that exact version:

```sh
npx --no-install durable-subconscious update --project . --to latest
npx --no-install durable-subconscious update --project . --to 0.5.1
npx --no-install durable-subconscious update --project . --to 0.5.1 --apply
```

See [`docs/UPGRADING.md`](docs/UPGRADING.md) for compatibility checks,
transactions, interrupted-update recovery, local package sources, and rollback.

## Removal and recovery

Remove only the managed block:

```sh
npx --no-install durable-subconscious integrate <agent> --project . --remove
```

Restore the exact pre-install instruction file when safe:

```sh
npx --no-install durable-subconscious integrate <agent> --project . --restore
```

Recovery refuses to overwrite later changes outside the managed block. The
pre-install manifest and backup are stored under
`.durable-subconscious/integrations/` in the selected adapter directory.

Removing the integration does not delete project knowledge. Removing
`.durable-subconscious/` itself is a separate project-data decision and is never
performed by the removal command.

## Core-only initialization

Projects using an unsupported agent may initialize the agent-independent core:

```sh
npx --no-install durable-subconscious init . --name "Project Name"
```

This creates the knowledge directory but no persistent agent instructions.

## Validate installation

During one-prompt setup, the agent performs the evidence-backed mapping and project
tests, then explicitly establishes the reviewed baseline. These commands document
what the agent runs and remain available for auditing, core-only operation, and
troubleshooting:

```sh
npx --no-install durable-subconscious reconcile --project . --accept-current-evidence
```

Then validate structure and freshness:

```sh
npx --no-install durable-subconscious check --project . --strict-coverage
```

Verify conceptual retrieval through the same freshness gate:

```sh
npx --no-install durable-subconscious query "where is persistence owned" --project . --depth 1
```

See `docs/SCHEMA.md` for capability coverage, golden journeys, typed gaps, and
privacy/storage decisions. Structural success is not proof that arbitrary source
contains no unrecorded capability.

Persistent instructions direct routine maintenance after relevant changes. If
source changes occur outside the active agent workflow, freshness becomes stale or
unknown, or a relationship remains unresolved, give the agent the reconciliation
prompt in [`docs/FRESHNESS.md`](docs/FRESHNESS.md). `check`, `impact`, and
`discover` are read-only and never advance the trusted baseline.

## Development verification

From the Durable Subconscious repository:

```sh
npm test
npm run check:example
```
