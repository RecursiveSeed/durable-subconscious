# Installation and configuration

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

## Upgrade from v0.3.x

After installing the new package version, refresh the already selected adapter:

```sh
npx --no-install durable-subconscious integrate <agent> --project .
```

This adds or refreshes one managed freshness section in the canonical agent guide
without replacing project-authored instructions. A pre-existing project initially
has no reconciled fingerprint baseline, so `check` and `impact` safely report
`unknown`. Review the existing graph and maps against current source before using
the explicit `reconcile --accept-current-evidence` command below. Upgrade never
silently marks existing evidence current.

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

After the first evidence-backed mapping and project tests, explicitly establish the
reviewed baseline:

```sh
npx --no-install durable-subconscious reconcile --project . --accept-current-evidence
```

Then validate structure and freshness:

```sh
npx --no-install durable-subconscious check --project . --strict-coverage
```

See `docs/SCHEMA.md` for capability coverage, golden journeys, typed gaps, and
privacy/storage decisions. Structural success is not proof that arbitrary source
contains no unrecorded capability.

For later independent changes, give the agent the human reconciliation prompt in
[`docs/FRESHNESS.md`](docs/FRESHNESS.md). `check`, `impact`, and `discover` are
read-only and never advance the trusted baseline.

## Development verification

From the Durable Subconscious repository:

```sh
npm test
npm run check:example
```
