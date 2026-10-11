# Installation and configuration

## Run directly from a clone

1. Install Node.js 20 or newer.
2. Clone this repository.
3. Run `node bin/durable-subconscious.mjs help` from the repository, or use the absolute path to that file from another project.

There are no runtime dependencies, build steps, native modules, environment variables, credentials, services, or network calls.

## Optional global command

For a local developer checkout, `npm link` exposes the `durable-subconscious` command through npm's normal global-link mechanism. This is optional; direct `node` execution is the most explicit setup.

## Initialize a project

```sh
durable-subconscious init /absolute/path/to/project --name "Project Name"
```

Without `--name`, the final directory name becomes the project name. Initialization creates a new `.durable-subconscious` directory and fails closed if that directory already exists.

## Use a non-default configuration location

Every read command accepts both a project root and a project-relative configuration path:

```sh
durable-subconscious check --project /absolute/path/to/project --config tools/memory/config.json
```

The configuration and configured graph must remain inside the project root. Graph node paths, map paths, gap evidence, and edge evidence must also be project-relative and inside that root.

## Validate installation

From this repository:

```sh
npm test
npm run check:example
```

The first command exercises initialization, persistence across independent processes, impact retrieval, project isolation, validation failure modes, lexical discovery, and the synthetic example. The second validates the example graph directly.
