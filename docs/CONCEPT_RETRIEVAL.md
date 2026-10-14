# Conceptual retrieval

Durable Subconscious v0.5 adds a small derived navigation index around the
existing graph engine. It implements this sequence:

```text
concept -> candidate identity -> authoritative graph location -> freshness-verified impact
```

The index is not evidence authority. It contains compact tuples of stable node
IDs, node types, short labels, optional aliases, and project-relative source
locations derived from the current graph. Search terms are computed in memory;
detailed knowledge remains in graph evidence, source files, and configured maps.

## Query

When the exact node ID is unknown, start with a shallow query:

```sh
npx --no-install durable-subconscious query "where is inventory persistence owned" --project . --depth 1
```

The result contains at most five candidates by default, the selected stable ID
when the ranking is unambiguous, its authoritative source location when declared,
and the ordinary impact/freshness result. Use `--limit 1..20` to change the
candidate bound and `--depth 1..32` to expand typed traversal deliberately.

An ambiguous result exits `2` without selecting an identity. Review the focused
candidates and choose explicitly:

```sh
npx --no-install durable-subconscious query "session owner" --project . --select state.session --depth 2
```

Stale or unknown authoritative evidence exits `3`, exactly like `impact`. A
candidate never bypasses freshness verification. A missing or renamed source is
reported by the existing freshness engine rather than silently followed.

## Aliases

Nodes may declare short, evidence-supported aliases:

```json
{
  "id": "module.session-store",
  "type": "module",
  "label": "Session persistence owner",
  "aliases": ["session storage", "saved session owner"],
  "path": "src/session-store.mjs"
}
```

Aliases are navigation terms, not new relationships or proof. Use names that a
developer would naturally ask for; do not copy prose, source content, secrets, or
private data into them.

## Cache lifecycle

The default cache is `.durable-subconscious/concept-index.json`. Its graph SHA-256
must match the authoritative graph. A missing, corrupt, or mismatched cache is
rebuilt atomically. `--rebuild-index` forces a rebuild. Rebuilding the cache never
changes the graph or freshness baseline and never reconciles evidence.

The index can be deleted safely. The next query recreates it from the graph.

## Limits

- Ranking is lexical; synonyms not represented by IDs, labels, paths, types, or
  explicit aliases may not be found.
- Ambiguous concepts require a human or agent selection.
- A current hash proves reviewed bytes are unchanged, not semantic correctness.
- Deeper traversal can return more context; begin shallow and expand a disclosed
  frontier only when it is relevant.
