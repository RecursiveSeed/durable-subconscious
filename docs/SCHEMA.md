# Durable Subconscious schema reference

Durable Subconscious stores project-local knowledge as JSON-form YAML 1.2. The
current configuration and graph schema version is `1`. JSON is used so Node.js can
load the files without a runtime dependency.

## Configuration

The default configuration is `.durable-subconscious/config.json`:

```json
{
  "schema_version": 1,
  "project_name": "example-project",
  "agent_guide": ".durable-subconscious/agent-guide.md",
  "graph": ".durable-subconscious/graph.json",
  "memory_files": [
    ".durable-subconscious/maps/overview.md"
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
    "expected_capability_count": 1,
    "required_capability_ids": ["CAP-001"]
  }
}
```

All paths are relative to the project root. Absolute paths, traversal outside the
root, and configured sensitive path segments are rejected.

`expected_capability_count` may be `null` while the first mapping is incomplete.
Set it to the reviewed capability count before declaring setup complete.
`required_capability_ids` records the exact reviewed inventory. Do not set
`capability_coverage_required` to `false` merely to make validation pass.

## Nodes

Every node needs a unique `id`, a controlled `type`, and a useful `label`.
Project-backed nodes normally include a project-relative `path` and an `owner` node
ID.

Controlled node types are:

`system`, `module`, `authority`, `state`, `storage`, `cache`, `worker`, `route`,
`provider`, `surface`, `capability`, `test`, `journey`, `privacy`, and `issue`.

Lifecycle and boundary fields are conditional:

- `system` nodes require `owner`.
- `persistent: true` requires `hydration_owner`.
- `cache` requires `invalidation_owner` and `invalidation_rule`.
- `worker` requires stale and recovery owners and rules.
- `private: true` requires `privacy_boundary`.
- A `provider` requires an inbound `CONSUMES` relationship from its actual output
  consumer.

## Capability coverage

A capability's `coverage` object contains a concrete human task and references to
one or more `journey` node IDs:

```json
{
  "id": "CAP-001",
  "type": "capability",
  "label": "List stored items",
  "path": "src/catalog.mjs",
  "owner": "catalog.owner",
  "accepted": true,
  "coverage": {
    "human_task": "Request the inventory and verify stored items are returned",
    "golden": ["journey.list-items"]
  }
}
```

`golden` is not a file list. Each value is the ID of a mapped `journey` node.
Accepted capabilities also require:

- an inbound `IMPLEMENTS_CAPABILITY` edge from an implemented node; and
- an outbound `PROTECTED_BY_TEST` edge to a `test` node with
  `implemented: true`.

Journey descriptions do not become executable tests merely by being listed.

## Edges and provenance

Every edge requires a unique `id`, `from`, `type`, `to`, `source`, `impact`, and at
least one project-relative evidence path.

Controlled edge types are:

`OWNS`, `READS`, `WRITES`, `PROJECTS`, `TRANSFORMS`, `PERSISTS`, `HYDRATES`,
`CACHES`, `INVALIDATES`, `SCHEDULES`, `CONSUMES`, `FALLS_BACK_TO`,
`RECOVERS_WITH`, `MUST_NOT_ACCESS`, `MUST_NOT_CHANGE`, `DISPLAYED_BY`,
`IMPLEMENTS_CAPABILITY`, and `PROTECTED_BY_TEST`.

Evidence sources are `CODE_DISCOVERED`, `CANONICAL_CONTRACT`, `HUMAN_APPROVED`,
`AUDIT_DISCOVERED`, and `INFERRED_PENDING_REVIEW`. Impact direction is `forward`,
`reverse`, `both`, or `none`.

## Typed gaps

Uncertainty is data and must not be erased to obtain a pass. Attach a gap to the
affected node:

```json
{
  "id": "inventory.cache",
  "type": "cache",
  "label": "Inventory cache",
  "path": "src/cache.mjs",
  "owner": "catalog.owner",
  "gaps": [
    {
      "code": "INVALIDATION_MISSING",
      "reason": "No invalidation owner is established yet",
      "evidence": ".durable-subconscious/maps/lifecycle.md"
    }
  ]
}
```

Each gap needs a validator-recognized or project-defined `code`, a concrete
`reason`, and one existing project-relative `evidence` file. Normal `check` reports
acknowledged gaps without failing. `check --strict-coverage` fails while any gap
remains.

## Stale-graph boundary

Validation checks the declared graph; it cannot prove that every semantic
capability in arbitrary source code was declared. A source change can therefore
leave a structurally valid but stale graph. Supported Codex integration mitigates
this by requiring impact retrieval before material edits and knowledge maintenance
after verified changes. It is a workflow control, not exhaustive program analysis.

Use `examples/synthetic-project` for a complete synthetic graph with capability,
journey, persistence, privacy, cache, and executable-test relationships.

## Storage, backup, sharing, and privacy

`.durable-subconscious/` belongs to the target project and can contain sensitive
architecture or security information.

- Keep it local and ignored when the knowledge should remain private to one
  machine.
- Commit it only after deliberate review when the team should share it.
- Back it up with the same access controls as the source project.
- Never put credentials, raw private data, production databases, or unrestricted
  local paths in graph or map evidence.
- The Codex integration stores its recovery manifest and any pre-install
  `AGENTS.md` backup under `.durable-subconscious/integrations/codex/`.
