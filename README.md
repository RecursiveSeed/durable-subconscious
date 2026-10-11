# Durable Subconscious

Durable Subconscious is a local, file-backed architectural memory for software projects. It records systems, owners, state, persistence, caches, workers, privacy boundaries, capabilities, tests, issues, and the evidence-backed relationships between them. Its impact query starts from a file or typed node and retrieves the connected owners, consumers, risks, tests, journeys, and unresolved frontiers that should be inspected before a change.

The system is deliberately not a source of product truth. Project code and accepted project documents remain authoritative. The graph remembers proven relationships and makes uncertainty visible; it does not infer permission or turn a structural check into functional acceptance.

## Capabilities

- A typed, evidence-bearing dependency graph stored as JSON-form YAML 1.2.
- Structural validation for ownership, persistence/hydration, cache invalidation, worker staleness/recovery, privacy boundaries, providers, capabilities, executable regression protection, and explicit gaps.
- Recursive impact queries with bounded traversal, cycle handling, ownership context, protection leaves, and disclosed depth/co-location frontiers.
- Read-only lexical discovery of literal JavaScript imports and `/api/` strings from explicitly mapped module files. Discovery never evaluates project code.
- Project-local configuration, graph, and prose maps that survive process and machine restarts when the project directory is preserved.
- Isolation by project root: paths outside the selected root, absolute evidence paths, traversal, and configured sensitive path segments are rejected.
- No runtime packages or external services. The implementation uses Node.js built-ins only.

## Architecture

```text
project source and evidence
          |
          v
.durable-subconscious/config.json
          |
          +--> graph.json ----> validate ----> explicit errors and known gaps
          |         |
          |         +---------> impact query ----> owners, consumers, tests, risks
          |         |
          |         +---------> discovery -------> lexical evidence for review
          |
          +--> maps/*.md -----> durable prose context and unresolved frontiers
```

The graph uses three controlled vocabularies:

- Node types: `system`, `module`, `authority`, `state`, `storage`, `cache`, `worker`, `route`, `provider`, `surface`, `capability`, `test`, `journey`, `privacy`, and `issue`.
- Edge types: `OWNS`, `READS`, `WRITES`, `PROJECTS`, `TRANSFORMS`, `PERSISTS`, `HYDRATES`, `CACHES`, `INVALIDATES`, `SCHEDULES`, `CONSUMES`, `FALLS_BACK_TO`, `RECOVERS_WITH`, `MUST_NOT_ACCESS`, `MUST_NOT_CHANGE`, `DISPLAYED_BY`, `IMPLEMENTS_CAPABILITY`, and `PROTECTED_BY_TEST`.
- Evidence provenance: `CODE_DISCOVERED`, `CANONICAL_CONTRACT`, `HUMAN_APPROVED`, `AUDIT_DISCOVERED`, and `INFERRED_PENDING_REVIEW`.

Each edge declares an impact direction (`forward`, `reverse`, `both`, or `none`) and at least one project-relative evidence path.

## Requirements

- Node.js 20 or newer.
- A writable project directory for initialization and knowledge maintenance.
- Git is optional for normal use and recommended for reviewing non-private graph changes.

No database, account, network service, package installation, or original host application is required.

## Quick start

Clone this repository, then initialize an unfamiliar project:

```sh
node /path/to/durable-subconscious/bin/durable-subconscious.mjs init /path/to/your-project
```

Initialization creates `/path/to/your-project/.durable-subconscious/`. It refuses to overwrite an existing knowledge directory.

Validate the new project memory:

```sh
node /path/to/durable-subconscious/bin/durable-subconscious.mjs check --project /path/to/your-project
```

Edit the project-local graph and maps as evidence is established, then query a node or mapped file:

```sh
node /path/to/durable-subconscious/bin/durable-subconscious.mjs impact project --project /path/to/your-project
node /path/to/durable-subconscious/bin/durable-subconscious.mjs impact src/server.mjs --project /path/to/your-project --json
```

Run read-only lexical discovery over module nodes already present in that graph:

```sh
node /path/to/durable-subconscious/bin/durable-subconscious.mjs discover --project /path/to/your-project
```

See [`examples/synthetic-project`](examples/synthetic-project) for a complete fictional project with a configured capability, persistence, privacy, cache, test, and journey chain.

## Configuration

The default file is `.durable-subconscious/config.json` inside the target project:

```json
{
  "schema_version": 1,
  "project_name": "your-project",
  "graph": ".durable-subconscious/graph.json",
  "memory_files": [
    ".durable-subconscious/maps/overview.md",
    ".durable-subconscious/maps/authority.md"
  ],
  "forbidden_path_segments": [
    ".git",
    "node_modules",
    ".env",
    "secrets",
    "credentials"
  ],
  "graph_rules": {
    "capability_coverage_required": true,
    "expected_capability_count": null,
    "required_capability_ids": []
  }
}
```

Paths are resolved against the selected project root. Absolute paths and `..` traversal are rejected. Add project-specific sensitive directory or file names to `forbidden_path_segments`; matching is case-insensitive and also blocks a filename whose extension is removed before comparison.

`expected_capability_count` and `required_capability_ids` are optional project contracts. They replace hard-coded assumptions about any one product's capability inventory.

## Maintaining knowledge

Use the same evidence-first loop for every material change:

1. Query the proposed file, node, or capability with `impact`.
2. Inspect the earliest proven owner and actual writers/readers.
3. Verify persistence/hydration, caches/invalidation, asynchronous stale/recovery behavior, privacy boundaries, and connected tests.
4. Add or correct graph nodes and edges only when a source path or accepted document supports them.
5. Record uncertainty as a typed gap with a reason and evidence path; do not invent a relationship to make validation green.
6. Run `check`, the relevant project tests, and the impact query again.

Application code may import `writeGraphAtomic` from `src/subconscious-lib.mjs` when it needs to persist a reviewed graph update without exposing partial JSON. The command-line tool intentionally does not guess nodes or mutate an existing graph.

## Check semantics

`check` exits nonzero for structural errors. `check --strict-coverage` also exits nonzero when acknowledged gaps remain. A normal structural pass means the graph is internally coherent and its referenced files exist. It does not prove that product behavior works, that every dependency is mapped, or that a human workflow passed.

`impact` exits `2` when any requested target is unknown. An empty result is never treated as proof that a target has no dependencies.

## Privacy and distribution

The initialized `.durable-subconscious/` directory is local project knowledge and may contain architectural or security-sensitive relationships. This repository's `.gitignore` excludes project-specific knowledge, credentials, caches, logs, and local state by default. Decide deliberately whether any project map is safe and useful to publish.

The included example contains synthetic names and data only. No production project graph, evidence corpus, credentials, authored content, personal information, runtime database, or machine-specific path is part of this distribution.

## Development

```sh
npm test
npm run check:example
npm run discover:example
```

The package has no install dependencies. `npm install` is not required to run the source or tests.

## Limits

- Lexical discovery is partial static evidence. Comments, dynamic imports, computed routes, and runtime data flow require review.
- A graph is durable memory, not exhaustive program analysis.
- Impact results are conservative regression candidates, not a claim that every returned component will change.
- The system does not call models, providers, browsers, or project runtimes.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## License

Durable Subconscious is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
