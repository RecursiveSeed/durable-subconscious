# Installation and configuration

## Requirements

- Node.js 20 or newer
- A writable project directory
- npm for the supported project-local installation
- Codex for the currently verified automatic AI integration

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

## Supported Codex setup

Give a fresh Codex session the exact setup prompt published in `README.md`. That
session runs:

```sh
npx --no-install durable-subconscious setup . --agent codex
```

The command performs two bounded operations:

1. Atomically creates `.durable-subconscious/` when it is absent. Existing project
   knowledge is never reinitialized.
2. Creates or refreshes one managed Durable Subconscious block in root
   `AGENTS.md`. Existing content remains outside the block.

Repeated setup is idempotent. Only Codex is currently verified; no universal
AI-agent compatibility is claimed.

## Removal and recovery

Remove only the managed block:

```sh
npx --no-install durable-subconscious integrate codex --project . --remove
```

Restore the exact pre-install instruction file when safe:

```sh
npx --no-install durable-subconscious integrate codex --project . --restore
```

Recovery refuses to overwrite later changes outside the managed block. The
pre-install manifest and backup are stored under
`.durable-subconscious/integrations/codex/`.

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

```sh
npx --no-install durable-subconscious check --project . --strict-coverage
```

See `docs/SCHEMA.md` for capability coverage, golden journeys, typed gaps, and
privacy/storage decisions. Structural success is not proof that arbitrary source
contains no unrecorded capability.

## Development verification

From the Durable Subconscious repository:

```sh
npm test
npm run check:example
```
