# Release notes

## Unreleased — proposed v0.4.0

This candidate adds a compatibility-affecting reliability gate: `check` and
`impact` now distinguish current, stale, and unknown evidence using a project-local
reconciled fingerprint baseline and bounded source inventory. Stale relationships
are retained as historical memory but are not presented as verified current facts.

The new `reconcile --accept-current-evidence` command advances the baseline only
after explicit agent or developer review. Read-only commands never update trust;
prior baselines are archived; repeated reconciliation is idempotent; and changes
during verification or reconciliation fail safely. The canonical agent guide now
includes the human-triggered reconciliation prompt and lifecycle.

The graph and configuration schemas remain version `1`, the package remains
dependency-free and AGPL-3.0-only, and existing agent adapters are preserved. This
does not add independent session verification for Claude Code, Cursor, GitHub
Copilot, Gemini CLI, or OpenCode.

Existing v0.3.x projects must refresh their selected adapter to install the managed
freshness guide section, then review and explicitly reconcile their current source
and knowledge. Until then, the missing baseline reports `unknown`; upgrade never
silently accepts old project memory as current.

### Community acknowledgment

**Theodor N. Engøy (Turnfeed)** — “Identified the need to test whether independent
source-code changes can leave Durable Subconscious relying on stale architectural
relationships. Suggestion developed with Codex assistance.”

This credits the community testing suggestion. The CEO specified the two-layer
verification design, and Codex implemented and tested the resulting change; the
contributor is not represented as its implementer or verifier.

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
- Distribution scans found no Whispering Woods private data, credentials, private
  keys, access tokens, or machine-specific paths.

These checks establish the tested release surface; they do not substitute for the
five outstanding independent agent-session tests.

### License and sponsorship

The release remains licensed **AGPL-3.0-only**. GitHub Sponsors configuration for
`RecursiveSeed` is preserved.
