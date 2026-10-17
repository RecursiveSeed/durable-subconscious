# Release notes

## v0.6.0 — Final-Consumer Contract Verification (2026-10-17)

Durable Subconscious now distinguishes architectural connectivity from verified
behavior. Existing capability nodes may optionally classify a requirement as a
shared invariant or consumer-specific contract, declare the exact proof nodes
needed to satisfy it, and retrieve the evidence level and scope through the normal
focused impact path.

Test nodes record executed evidence; journey nodes record observed runtime or
human-visible evidence. Verification scope is component, integration, or final
consumer. A contract passes only when every named proof at its required level and
scope records a pass. A matching failure reports failure; missing, declared-only,
mismatched, stale, or unavailable proof remains `unknown`. For a shared invariant,
one passing consumer cannot certify the other required consumers.

Verification evidence uses the existing provenance and freshness system. Impact
output preserves the recorded historical status while reducing the trusted status
to `unknown` when required proof is stale or cannot be verified. A current
fingerprint still means only that the recorded bytes are unchanged; it is not a
claim that the test is semantically complete.

The extension is contained within existing capability, test, journey, impact, and
freshness structures. No node or edge vocabulary was forked, and the graph,
configuration, freshness, and installation schemas remain version `1`. Existing
v0.5.0 graphs without behavioral contract metadata remain valid and report the
new verification boundary as `not_declared`.

The managed agent guide keeps verification proportional: find the owner, follow
the affected contract, inspect its relevant proof, implement, test, and update
knowledge. It does not require full-project end-to-end testing for every localized
change. Developers still install once and let a supported agent maintain relevant
knowledge through its persistent workflow.

### Compatibility status

Codex retains its previously independently verified fresh-session lifecycle.
Claude Code, Cursor, GitHub Copilot, Gemini CLI, and OpenCode remain documented and
adapter-tested but actual-agent-session **UNVERIFIED**. v0.6.0 does not claim
universal compatibility or guaranteed instruction compliance.

### Known limitations

- Durable Subconscious records and freshness-checks verification artifacts; it
  does not execute every project test automatically or understand whether an
  arbitrary test is semantically sufficient.
- Observed or human-visible acceptance remains separate from executed test proof
  and stays unknown until appropriate observed evidence is recorded.
- Structural validity, fresh evidence, and a passing test are distinct signals;
  none alone guarantees complete behavioral correctness.
- The focused twelve-system synthetic topology verifies bounded retrieval and
  multi-consumer proof accounting, not production-scale performance.

### Executed v0.6.0 release checks

- 55 of 55 canonical core, freshness, retrieval, upgrade, adapter,
  final-consumer, and packaged-example tests passed.
- The synthetic regression kept its shallow producer test passing while a
  deliberate control-panel regression was detected by the final-consumer test;
  the unaffected archive consumer continued to pass.
- A twelve-system connected synthetic topology required every named consumer
  proof for its shared invariant and kept a depth-bounded impact query focused.
- The published v0.5.0 tag upgraded through its real updater to the packed v0.6.0
  candidate. Graph, configuration, freshness baseline, maps, and authored agent
  instructions were preserved; the managed contract guide was added without
  reconciliation.
- The package dry run contained 55 intended files, no bundled dependencies, and
  only independently created fictional examples. The dependency advisory audit
  reported zero known vulnerabilities.

## v0.5.0 — Synapse-to-Storage Retrieval and Durable Updates (2026-10-14)

This public-beta release retains the v0.4 graph, typed impact traversal,
evidence authority, freshness verification, reconciliation boundary, project
storage, and six agent adapters. It adds two bounded facilities around that core.

`query` derives a compact concept/alias candidate cache from stable graph
identities, labels, types, paths, and optional aliases. A focused candidate is
then resolved through the existing impact and freshness engine. Ambiguous queries
require explicit selection; stale, missing, renamed, or unknown evidence keeps the
existing exit code `3`; rebuilding the cache never reconciles evidence.

`update` adds plan/apply transactions for supported stable package upgrades. The
target package is staged and its exact version and declared transition are checked
before installation files change. A standalone helper performs replacement,
refreshes only managed instruction sections, verifies unchanged knowledge and
freshness state, and rolls back bounded package/instruction files on failure.
Interrupted transactions block later updates until explicit recovery.

v0.3 and v0.4 installations require a documented one-time bootstrap after npm
installs v0.5, because those older packages do not contain an updater. The
bootstrap and all later upgrades preserve graph knowledge, maps, evidence history,
typed gaps, freshness data, configuration, and authored instructions. They never
silently accept current evidence.

The graph/config/freshness schemas remain version `1`. The package remains
dependency-free and AGPL-3.0-only. Codex retains its previously independent
session verification; Claude Code, Cursor, GitHub Copilot, Gemini CLI, and OpenCode
remain adapter-tested but actual-agent-session **UNVERIFIED**.

### Known limitations

- Concept ranking is lexical. Unrepresented synonyms require a graph alias.
- Ambiguous concepts require an explicit stable-ID selection.
- `latest` discovery requires GitHub network access; exact versions and approved
  local package artifacts remain available.
- Completed update transactions discard bulky rollback backups. The rollback
  command is for failed or interrupted transactions, not deliberate downgrades.
- Package updates and current fingerprints do not prove semantic correctness.

### Executed v0.5.0 release checks

- 41 of 41 canonical core, retrieval, upgrade, adapter, and packaged-example tests
  passed.
- Fictional v0.3 and v0.4 installations preserved graph identities, typed gaps,
  maps, freshness state/history, and authored instructions through bootstrap.
- A fictional v0.5.0 installation upgraded to a locally packed v0.5.1 candidate;
  repeated application was unchanged; a simulated interrupted v0.5.2 update was
  recovered explicitly; and an injected post-install failure rolled back without
  knowledge loss.
- On a 10,000-node fictional graph, v0.5 conceptual retrieval completed in about
  60 ms while building the cache and about 45 ms warm, versus v0.4 returning the
  conceptual input as unknown. The exact-ID v0.4 path remained faster, as intended.
- The 10,000-node compact index was 737,947 bytes for an 877,879-byte source graph
  and returned at most five candidates with a depth-one authoritative traversal.
- The package dry run contained 38 intended files, no bundled dependencies, and
  no test fixtures or local project knowledge. The dependency advisory audit
  reported zero known vulnerabilities.

## v0.4.0 — Evidence Freshness (2026-10-11)

This release adds a compatibility-affecting reliability gate: `check` and
`impact` now distinguish current, stale, and unknown evidence using a project-local
reconciled fingerprint baseline and bounded source inventory. Stale relationships
are retained as historical memory but are not presented as verified current facts.

The new `reconcile --accept-current-evidence` command advances the baseline only
after explicit agent or developer review. Read-only commands never update trust;
prior baselines are archived; repeated reconciliation is idempotent; and changes
during verification or reconciliation fail safely. The canonical agent guide now
includes the human-triggered reconciliation prompt and lifecycle.

`check` and `impact` use exit code `3` for stale or unknown evidence. Structural
errors and strict-coverage gaps remain exit code `1`. Reconciliation can preserve
typed gaps while marking reviewed bytes current; it never converts those unresolved
relationships into certified semantic facts.

The graph and configuration schemas remain version `1`, the package remains
dependency-free and AGPL-3.0-only, and existing agent adapters are preserved. This
does not add independent session verification for Claude Code, Cursor, GitHub
Copilot, Gemini CLI, or OpenCode.

Existing v0.3.x projects must refresh their selected adapter to install the managed
freshness guide section, then review and explicitly reconcile their current source
and knowledge. Until then, the missing baseline reports `unknown`; upgrade never
silently accepts old project memory as current.

### Community acknowledgment

**Theodor N. Engøy (Turnfeed)**

"Identified the need to test whether independent source-code changes can leave Durable Subconscious relying on stale architectural relationships. Suggestion developed with Codex assistance."

This credits the community testing suggestion. The CEO specified the two-layer
verification design, and Codex implemented and tested the resulting change; the
contributor is not represented as its implementer or verifier.

### Executed v0.4.0 release checks

- 35 of 35 focused core and integration tests passed.
- 36 of 36 canonical tests passed when the synthetic example test was included.
- The workspace-inclusive `npm test` run passed 106 of 106 discovered tests; this
  count includes ignored investigation fixtures that are not packaged.
- A clean project installed the packed v0.4.0 tarball, preserved existing agent
  instructions, initialized, reconciled, and passed structural/freshness checks.
- The packed artifact contained 32 intended files, no bundled dependencies, and
  no temporary investigation fixtures.
- The dependency advisory audit reported zero known vulnerabilities, and the
  release security scan found no credentials, private keys, tokens, machine paths,
  or private project evidence.

## v0.3.0 — Public Beta Candidate

Durable Subconscious v0.3.0 adds agent-integration adapters around the existing
agent-independent engine, storage, graph schema, validation, discovery, impact
analysis, and persistence lifecycle. It does not rebuild or fork the core engine.

This designation is not a claim of universal compatibility or guaranteed
automatic behavior across AI systems.

### Compatibility evidence

- **OpenAI Codex — independently verified.** An installed package was exercised
  in an unfamiliar project across separate real sessions for setup, initial
  mapping, persisted retrieval, uncued feature work, pre-change impact analysis,
  post-change maintenance and validation, and preservation of existing project
  instructions.
- **Claude Code, Cursor, GitHub Copilot, Gemini CLI, and OpenCode — adapter tested,
  agent-session UNVERIFIED.** Their official project-instruction mechanisms were
  documented, and synthetic tests exercised instruction installation,
  preservation, idempotent reinstallation, removal, and recovery. No independent
  session from those agents was available for v0.3.0, so automatic lifecycle
  behavior is not claimed.

See [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for the evidence definitions,
official mechanism references, exact instruction paths, and remaining tests.

### Installation changes

- Adds one-prompt setup with explicit `codex`, `claude`, `cursor`, `copilot`,
  `gemini`, and `opencode` selections.
- Installs only the selected integration and preserves existing project rules.
- Keeps one canonical `.durable-subconscious/agent-guide.md` lifecycle for every
  adapter.
- Supports idempotent setup, managed-block removal, exact recovery when safe, and
  migration from the v0.2 Codex integration.
- Keeps core-only initialization available without an AI provider, proprietary
  API, cloud subscription, or runtime dependency.

### Executed release checks

- 26 of 26 automated tests passed.
- Synthetic example validation and lexical discovery passed.
- The release package contained only the intended distribution files and no
  bundled dependencies.
- The dependency audit reported zero known vulnerabilities.
- Distribution scans found no private project data, credentials, private
  keys, access tokens, or machine-specific paths.

These checks establish the tested release surface; they do not substitute for the
five outstanding independent agent-session tests.

### License and sponsorship

The release remains licensed **AGPL-3.0-only**. GitHub Sponsors configuration for
`RecursiveSeed` is preserved.
