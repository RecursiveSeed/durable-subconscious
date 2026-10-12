# Evidence freshness and reconciliation

Durable Subconscious keeps remembered architecture separate from current project
authority. Source code and accepted project documents remain authoritative. A
fingerprint records what an agent successfully reconciled; it is not automatic
proof that the graph is complete or semantically correct.

## Two verification layers

### Automatic verification before reliance

`check` and `impact` compare relevant evidence with the project-local
`freshness.json` baseline before reporting relationships as current. The baseline
contains SHA-256 content fingerprints, a bounded inventory of files under mapped
source directories, and read-only lexical discovery results.

Freshness states are:

- **current:** relevant evidence is unchanged since successful reconciliation;
  semantic completeness is still not proven;
- **stale:** evidence changed, disappeared, was renamed, or a relevant source
  dependency was added;
- **unknown:** no baseline exists, evidence cannot be inspected reliably, a
  dynamic dependency cannot be resolved, or verification raced with another
  change.

Stale or unknown remembered edges remain available as historical knowledge but
are separated from verified-current connections. `impact` exits `3` and requires
source review before a decision relies on them. Read-only commands never update
the baseline.

Targeted impact verification hashes the target, directly connected evidence, and
the traversed knowledge slice. It lists the bounded source inventory without
rehashing every unrelated file. Full `check` verifies the complete configured
evidence and inventory.

### Human-triggered reconciliation

A developer can give a supported agent this instruction:

```text
Check my recent project changes, identify affected dependencies, reconcile your subconscious with current source evidence, and report anything that remains uncertain.
```

The agent must inspect the changes and current source, compare the graph and maps,
update only evidence-supported knowledge, retain typed uncertainty, run the
project's tests and structural validation, and then explicitly accept the reviewed
baseline:

```sh
npx --no-install durable-subconscious reconcile --project . --accept-current-evidence
npx --no-install durable-subconscious check --project . --strict-coverage
npx --no-install durable-subconscious impact <changed-file-or-capability> --project .
```

`--accept-current-evidence` is deliberately required. Running discovery, check, or
impact cannot mark changed evidence current. Reconciliation fails when structural
errors exist, evidence is unavailable, another reconciliation is running, or the
project changes during the snapshot. A repeated reconciliation with identical
evidence is idempotent and does not rewrite the baseline.

When a baseline changes, the prior manifest is retained under
`.durable-subconscious/freshness-history/`. This preserves the earlier evidence
state; it does not silently retain source contents.

## Source inventory

By default, source roots are derived from mapped `module`, `route`, `provider`,
and `test` node paths. The scanner follows ordinary directories only, skips the
Durable Subconscious state directory and configured forbidden path segments, and
does not follow symbolic links.

Projects may configure bounded roots and extensions:

```json
{
  "freshness": ".durable-subconscious/freshness.json",
  "freshness_rules": {
    "source_roots": ["src", "test"],
    "source_extensions": [".js", ".mjs", ".ts", ".tsx"]
  }
}
```

An unrelated file outside those roots does not globally invalidate a targeted
impact query. A new literal dependency imported by a relevant mapped module is
reported before the old relationship can be presented as current.

## Privacy and security

Freshness data is project-local. It stores relative paths, hashes, sizes, lexical
dependency metadata, and timestamps—not file contents. Forbidden paths and project
root isolation apply to evidence and inventory traversal. No network service, Git
account, proprietary API, or cloud subscription is used. Git status may help a
human review but is never treated as the freshness authority.

Keep `.durable-subconscious/` private when its filenames or architecture are
sensitive. Share a reviewed manifest only when the team deliberately shares the
corresponding project knowledge.

## Limits

- Unchanged hashes prove only that the reviewed bytes did not change.
- Dynamic imports, computed routes, runtime registration, generated code, and
  semantic behavior may remain unknown and require human or agent review.
- Free-form prose maps cannot be exhaustively checked for semantic consistency.
- File-level hashing is conservative: a comment-only edit still requires review.
- If a process terminates while holding the reconciliation lock, later checks fail
  safely as `unknown` and reconciliation refuses to run. After confirming no
  reconciliation process remains, an operator may remove the project-local
  `.durable-subconscious/freshness-reconciliation.lock` and retry.
- A change immediately after verification is a new external change and will be
  detected by the next check or impact query.

## Upgrading existing project knowledge

Projects created before this freshness gate have no trusted fingerprint baseline.
After upgrading the package, rerun `integrate <agent> --project .` to add the
managed freshness requirements to the existing canonical agent guide. Existing
guide content and agent instruction content are preserved. The missing baseline
continues to report `unknown` until current source and knowledge have been reviewed
and reconciliation is explicitly accepted; installation or adapter refresh alone
never advances trust.

