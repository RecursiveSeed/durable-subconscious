# Version-aware upgrades and recovery

Durable Subconscious separates software installation from project knowledge.
Updating the package never reconciles evidence, accepts a changed baseline, or
reinitializes `.durable-subconscious/`.

## One-time v0.3/v0.4 bootstrap

Older packages do not contain the updater and cannot update themselves. Install
the v0.6 package using the existing project-local npm method first:

```sh
npm install --save-dev github:RecursiveSeed/durable-subconscious#v0.6.0
```

Then review the bootstrap plan using the version that was previously installed:

```sh
npx --no-install durable-subconscious update --project . --bootstrap-from 0.4.0 --agent codex
```

Use `0.3.0` for a v0.3 installation and substitute the selected agent identifier.
After reviewing the plan, apply the same operation:

```sh
npx --no-install durable-subconscious update --project . --bootstrap-from 0.4.0 --agent codex --apply
```

Bootstrap creates version metadata, refreshes only managed instruction sections,
builds the derived concept index, and verifies the existing graph and freshness
state. It does not mark old evidence current. A missing baseline remains unknown;
a stale baseline remains stale.

## Future supported upgrades

Ask for the latest stable version only to discover the proposed exact version:

```sh
npx --no-install durable-subconscious update --project . --to latest
```

Then use the reported version explicitly for predictable application:

```sh
npx --no-install durable-subconscious update --project . --to 0.6.0
npx --no-install durable-subconscious update --project . --to 0.6.0 --apply
```

`latest` reads stable `vMAJOR.MINOR.PATCH` GitHub tags. An explicit `--source`
package path or npm/Git specification is available for an approved local or
pre-release verification artifact; the staged package version must still equal
`--to` and declare the current version as supported.

The no-`--apply` command is read-only with respect to the installed package and
prints the proposed package, managed files, adapters, and protected knowledge
classes. Repeating an already completed version is idempotent.

## Transaction and preservation model

Before replacement, the updater stages the candidate outside the installed
package, verifies its name, exact version, and declared transition, then copies a
standalone update helper into a project-local transaction directory. The helper:

1. hashes graph knowledge, maps, freshness data/history, evidence, gaps, and
   integration recovery records;
2. backs up only package metadata, the installed package, command shims, the
   canonical guide, installation metadata, and selected instruction files;
3. uses npm to replace the project-local package;
4. asks the newly installed package to refresh managed instructions and verify
   structure, freshness, conceptual retrieval, and unchanged knowledge;
5. records the result without running reconciliation.

User-authored instruction content outside managed markers is preserved. The
graph, maps, evidence history, and freshness baseline are never migration scratch
space.

## Interrupted or failed updates

An installation, migration, compatibility, or verification failure automatically
restores the bounded backup. If the process is interrupted before it can roll back,
the next update refuses to proceed and identifies the pending transaction:

```sh
npx --no-install durable-subconscious update --project . --rollback latest
```

An exact transaction ID may replace `latest`. Recovery restores only files owned
by that update transaction and does not erase unrelated work. Completed
transactions discard bulky package backups; deliberate downgrades are not an
updater recovery mechanism.

If network access is unavailable, staging fails before package files are modified.
Retry with network access or provide an approved local package using `--source`.

## Verification report

A successful report distinguishes:

- installed package version and transition;
- structural graph errors and acknowledged gaps;
- current, stale, or unknown freshness;
- refreshed adapters;
- concept-index candidate count;
- protected knowledge file count; and
- `reconciliation_performed: false`.

Review stale and unknown evidence normally. Do not accept current evidence merely
to make an upgrade report green.
