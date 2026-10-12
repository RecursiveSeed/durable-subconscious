# Release notes

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
