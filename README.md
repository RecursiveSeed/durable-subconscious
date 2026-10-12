# Durable Subconscious

Durable Subconscious gives AI coding agents durable, project-local architectural
memory across sessions. It records evidence-backed ownership, dependencies,
lifecycle, persistence, risks, and tests, then retrieves the relevant impact
context before and after a change. The core is a local Node.js tool with no runtime
packages, cloud service, or model-provider dependency.

The system is deliberately not a source of product truth. Project code and accepted project documents remain authoritative. The graph remembers proven relationships and makes uncertainty visible; it does not infer permission or turn a structural check into functional acceptance.

> **Release status:** v0.3.0 is a **Public Beta Candidate**. The Codex
> integration is independently verified end to end. Claude Code, Cursor, GitHub
> Copilot, Gemini CLI, and OpenCode have documented instruction mechanisms and
> tested adapters, but have not been verified in independent agent sessions.
> This release does not claim universal compatibility or guarantee automatic
> lifecycle behavior across AI systems. See [release notes](RELEASE_NOTES.md) and
> [the compatibility evidence](docs/COMPATIBILITY.md).

## Quick start

Install it as a development dependency in the project the agent should learn:

```sh
npm install --save-dev github:RecursiveSeed/durable-subconscious
```

Then start a fresh coding-agent session and paste the
[one-prompt setup](#one-prompt-setup). The prompt directs the agent to initialize
project-local knowledge, map the project from evidence, validate it, and install
only its own persistent instruction adapter. No database or account is required.

## Capabilities

- A typed, evidence-bearing dependency graph stored as JSON-form YAML 1.2.
- Structural validation for ownership, persistence/hydration, cache invalidation, worker staleness/recovery, privacy boundaries, providers, capabilities, executable regression protection, and explicit gaps.
- Recursive impact queries with bounded traversal, cycle handling, ownership context, protection leaves, and disclosed depth/co-location frontiers.
- Project-local evidence fingerprints and bounded source inventory that distinguish
  current, stale, and unknown memories before impact results are presented as
  verified current knowledge.
- Read-only lexical discovery of literal JavaScript imports and `/api/` strings from explicitly mapped module files. Discovery never evaluates project code.
- Project-local configuration, graph, and prose maps that survive process and machine restarts when the project directory is preserved.
- Isolation by project root: paths outside the selected root, absolute evidence paths, traversal, and configured sensitive path segments are rejected.
- Opt-in integrations for Codex, Claude Code, Cursor, GitHub Copilot, Gemini CLI,
  and OpenCode. Each adapter points its environment's persistent project
  instructions to one canonical, agent-independent lifecycle guide.
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
          |         +---------> freshness gate --> impact owners, consumers, tests, risks
          |         |
          |         +---------> discovery -------> lexical evidence for review
          |
          +--> maps/*.md -----> durable prose context and unresolved frontiers
          |
          +--> freshness.json -> reconciled hashes + bounded source inventory
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

Beyond installing the project-local package, no database, account, network
service, or original host application is required.

## Install in a project

Durable Subconscious is installed as a project-local development dependency. From
the target project:

```sh
npm install --save-dev github:RecursiveSeed/durable-subconscious
```

This provides `npx --no-install durable-subconscious` without relying on a separate
clone or machine-global command. There are no runtime dependencies.

## One-prompt setup

Start a fresh session in one of the supported AI coding environments and give it
this one prompt:

```text
Set up the installed Durable Subconscious for this project. Identify which supported coding agent you are—codex, claude, cursor, copilot, gemini, or opencode—then run `npx --no-install durable-subconscious setup . --agent <agent>`, substituting that identifier. Read `.durable-subconscious/agent-guide.md` and follow its First mapping section completely. Inspect the actual project source, tests, configuration, and accepted architecture documents; populate an evidence-backed graph and maps; keep uncertainty as typed gaps; do not disable validation rules; run the project tests; establish the reviewed baseline with `npx --no-install durable-subconscious reconcile --project . --accept-current-evidence`; and finish by running `npx --no-install durable-subconscious check --project . --strict-coverage` plus representative impact queries. Preserve every pre-existing project instruction and report any unresolved gaps or integration failures.
```

The explicit identifier is the dependable path. `--agent auto` is also available
when exactly one supported environment marker is present; it fails rather than
guessing when detection is absent or ambiguous.

Setup initializes `.durable-subconscious/` and installs one identifiable managed
block into only the selected environment's instruction file. Existing instructions
are preserved. The first session reads the generated guide explicitly because its
process began before the new instruction existed. Later sessions receive the
managed instruction through that agent's documented project-instruction mechanism
and are directed to consult and maintain the same project-local knowledge.

Setup is idempotent. It does not reinitialize or overwrite existing project
knowledge.

### Upgrading an existing installation

After upgrading from v0.3.x, rerun the selected adapter command once so the
canonical agent guide receives the managed freshness requirements while preserving
all existing project-authored instructions:

```sh
npx --no-install durable-subconscious integrate <agent> --project .
```

The first new `check` or `impact` reports freshness as `unknown` until an agent or
developer reviews the existing knowledge against current source and explicitly
runs `reconcile --accept-current-evidence`. This migration never accepts the
current files automatically.

## Manual initialization

For core-only or unsupported-agent use:

```sh
npx --no-install durable-subconscious init .
```

Initialization creates `.durable-subconscious/` and refuses to overwrite an
existing knowledge directory. Core initialization does not install an AI-agent
integration.

After mapping and reviewing the new project memory, establish its initial freshness
baseline and validate it:

```sh
npx --no-install durable-subconscious reconcile --project . --accept-current-evidence
npx --no-install durable-subconscious check --project .
```

Edit the project-local graph and maps as evidence is established, then query a node or mapped file:

```sh
npx --no-install durable-subconscious impact project --project .
npx --no-install durable-subconscious impact src/server.mjs --project . --json
```

Run read-only lexical discovery over module nodes already present in that graph:

```sh
npx --no-install durable-subconscious discover --project .
```

See [`examples/synthetic-project`](examples/synthetic-project) for a complete fictional project with a configured capability, persistence, privacy, cache, test, and journey chain.

## Configuration

The default file is `.durable-subconscious/config.json` inside the target project:

```json
{
  "schema_version": 1,
  "project_name": "your-project",
  "graph": ".durable-subconscious/graph.json",
  "freshness": ".durable-subconscious/freshness.json",
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

`freshness` names the project-local reconciled evidence manifest. Optional
`freshness_rules.source_roots` and `freshness_rules.source_extensions` can narrow
the bounded source inventory. Defaults are derived from mapped source/test nodes.

See [`docs/SCHEMA.md`](docs/SCHEMA.md) for complete node, edge, capability
coverage, human-task, golden-journey, and typed-gap formats. Installation does not
require the developer to author these structures manually; the setup prompt directs
the selected coding agent to populate them from project evidence.

## Agent compatibility

The core graph, validator, impact query, discovery, storage, and canonical
`.durable-subconscious/agent-guide.md` are agent-independent. Adapters only connect
that guide to the selected environment's documented persistent project
instructions.

This matrix is deliberately not a universal-compatibility claim. Automatic
consultation and maintenance depend on the selected external agent loading and
following its project instructions; only the Codex path has been independently
observed doing so across fresh sessions in v0.3.0.

| Environment | Installed instruction | Status in v0.3.0 |
| --- | --- | --- |
| OpenAI Codex | `AGENTS.md` | Independently verified end to end |
| Claude Code | `CLAUDE.md` | Documented mechanism; adapter tested; agent session unverified |
| Cursor | `AGENTS.md` | Documented mechanism; adapter tested; agent session unverified |
| GitHub Copilot | `.github/copilot-instructions.md` | Documented mechanism; adapter tested; agent session unverified |
| Gemini CLI | `GEMINI.md` | Documented mechanism; adapter tested; agent session unverified |
| OpenCode | `AGENTS.md` | Documented mechanism; adapter tested; agent session unverified |

“Adapter tested” means installation, preservation, repeat installation, removal,
and recovery were executed against synthetic projects. It is not a claim that an
independent session from that agent followed the lifecycle. See
[`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md) for official mechanism links,
scope, caveats, and the remaining verification requirements.

Inspect the machine-readable compatibility report:

```sh
npx --no-install durable-subconscious agents
```

### Help verify another agent

Independent reports for Claude Code, Cursor, GitHub Copilot, Gemini CLI, and
OpenCode are welcome. Follow the single
[three-session acceptance protocol](docs/INTEGRATION_TESTING.md), then open an
**Independent integration test** issue with sanitized PASS, PARTIAL, or FAIL
evidence. Failures and unexpected manual steps are useful results; installing an
adapter alone is not a compatibility pass.

## Agent integration lifecycle

Install or refresh only the managed block:

```sh
npx --no-install durable-subconscious integrate <agent> --project .
```

Remove the managed block while preserving all other instruction content:

```sh
npx --no-install durable-subconscious integrate <agent> --project . --remove
```

Restore the exact pre-install instruction file when it has not subsequently been
edited:

```sh
npx --no-install durable-subconscious integrate <agent> --project . --restore
```

The integration records a recovery manifest and, when applicable, an exact backup
under `.durable-subconscious/integrations/`. Codex, Cursor, and OpenCode deliberately
share the single `AGENTS.md` adapter and managed block; selecting one does not
install the other environments' files. Malformed or duplicate managed markers
cause a fail-closed error. Recovery refuses to overwrite later project instruction
changes.

## Maintaining knowledge

Use the same evidence-first loop for every material change:

1. Query the proposed file, node, or capability with `impact`. Stop and inspect
   current source when freshness is stale or unknown.
2. Inspect the earliest proven owner and actual writers/readers.
3. Verify persistence/hydration, caches/invalidation, asynchronous stale/recovery behavior, privacy boundaries, and connected tests.
4. Add or correct graph nodes and edges only when a source path or accepted document supports them.
5. Record uncertainty as a typed gap with a reason and evidence path; do not invent a relationship to make validation green.
6. Run the relevant project tests and structural validation.
7. After the source and knowledge are reconciled, explicitly run
   `reconcile --accept-current-evidence`.
8. Run `check` and the impact query again. Do not finish while relevant evidence
   remains stale or unknown.

After independent human changes, a developer can simply tell the AI:

```text
Check my recent project changes, identify affected dependencies, reconcile your subconscious with current source evidence, and report anything that remains uncertain.
```

See [evidence freshness and reconciliation](docs/FRESHNESS.md) for the trust model,
source inventory, race handling, and privacy rules.

Application code may import `writeGraphAtomic` from `src/subconscious-lib.mjs` when it needs to persist a reviewed graph update without exposing partial JSON. The command-line tool intentionally does not guess nodes or mutate an existing graph.

## Check semantics

`check` reports structural validation and freshness separately. It exits `1` for
structural errors or strict-coverage gaps and exits `3` when evidence is stale or
unknown. A structural pass means only that the declared graph is internally
coherent; it is not a freshness or functional acceptance result.

`impact` exits `2` when a requested target is unknown and `3` when remembered
relationships cannot be verified against the reconciled evidence baseline. Its
output separates verified-current connections from stale or unknown remembered
connections. An empty result is never proof that a target has no dependencies.

## Privacy and distribution

The initialized `.durable-subconscious/` directory is local project knowledge and may contain architectural or security-sensitive relationships. The package cannot choose the target project's sharing policy. Add it to that project's `.gitignore` to keep it local, or commit reviewed knowledge when the team deliberately wants to share it. Apply the same access controls and backup policy as the source project.

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
- Freshness hashes are change detectors, not semantic correctness certificates.
- A graph is durable memory, not exhaustive program analysis.
- Impact results are conservative regression candidates, not a claim that every returned component will change.
- Validation cannot detect every capability missing from the declared graph. A
  persistent adapter instructs an agent to maintain the graph, but only an actual
  independent agent-session test verifies that behavior end to end.
- The system does not call models, providers, browsers, or project runtimes.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and pull requests,
[the independent integration test](docs/INTEGRATION_TESTING.md) for reporting an
agent-session result, and [SECURITY.md](SECURITY.md) for private vulnerability
reporting guidance.

## License

Durable Subconscious is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`). See [LICENSE](LICENSE).
