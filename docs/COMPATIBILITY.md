# AI environment compatibility

Durable Subconscious v0.3.0 keeps its engine, project knowledge, graph schema,
validation, discovery, impact analysis, and persistence independent of any model
provider. An adapter only adds a small managed loader to one documented project
instruction file. Every adapter loads the same project-local
`.durable-subconscious/agent-guide.md`; there are no agent-specific forks of the
operating lifecycle.

The core freshness gate and explicit reconciliation command are agent-independent.
Adapters receive the same instruction to stop on stale or unknown evidence and to
advance a baseline only after evidence-backed reconciliation. This does not add
new agent-session verification: only Codex has the independent end-to-end status
described below; the five other environments remain agent-session **UNVERIFIED**.

v0.3.0 is designated a **Public Beta Candidate**. It is not a claim of universal
compatibility or guaranteed automatic behavior across AI systems. Codex is the
only integration independently verified through fresh agent sessions for this
candidate. The other five integrations are adapter-tested but agent-session
**UNVERIFIED**.

## Status definitions

- **Independently verified:** an installed package was exercised in an unfamiliar
  project through separate real agent sessions, including setup, mapping, a later
  uncued change, impact analysis, persistence, maintenance, and preservation.
- **Adapter tested:** automated synthetic-project tests executed installation,
  preservation, idempotent reinstallation, removal, and recovery for the exact
  instruction path.
- **Documented mechanism:** the environment's official documentation says that it
  loads the selected project instruction file automatically.
- **Unverified:** no independent session from that agent was available for this
  release. A generated instruction file is not counted as behavioral proof.

## Matrix

| Environment | Official persistent mechanism | Adapter installed by v0.3.0 | Executed status | Remaining independent test |
| --- | --- | --- | --- | --- |
| OpenAI Codex | Root-to-leaf `AGENTS.md` instructions are discovered and injected | Root `AGENTS.md` | Independently verified and adapter tested | None for the tested Codex CLI path |
| Claude Code | Project `CLAUDE.md` is persistent context; imports are supported | Root `CLAUDE.md`, importing the canonical guide | Documented, adapter tested, **UNVERIFIED** in an actual Claude session | Fresh Claude Code setup session and a separate uncued maintenance session |
| Cursor | Project rules support root `AGENTS.md` as a simple instruction source | Root `AGENTS.md` | Documented, adapter tested, **UNVERIFIED** in an actual Cursor session | Fresh Cursor Agent setup session and a separate uncued maintenance session |
| GitHub Copilot | Repository-wide `.github/copilot-instructions.md` is loaded in supported Copilot experiences | `.github/copilot-instructions.md` | Documented, adapter tested, **UNVERIFIED** in an actual Copilot session | Fresh supported Copilot coding-agent setup and a separate uncued maintenance session; confirm applicable feature/settings |
| Gemini CLI | Hierarchical `GEMINI.md` context files and `@` imports are loaded | Root `GEMINI.md`, importing the canonical guide | Documented, adapter tested, **UNVERIFIED** in an actual Gemini CLI session | Fresh Gemini CLI setup session and a separate uncued maintenance session |
| OpenCode | Project `AGENTS.md` instructions are loaded | Root `AGENTS.md` | Documented, adapter tested, **UNVERIFIED** in an actual OpenCode session | Fresh OpenCode setup session and a separate uncued maintenance session |

Official references:

- [OpenAI Codex project instructions: `AGENTS.md`](https://developers.openai.com/codex/agent-configuration/agents-md)
- [Claude Code memory and project instructions](https://code.claude.com/docs/en/memory)
- [Cursor rules and `AGENTS.md`](https://cursor.com/docs/rules)
- [GitHub Copilot repository custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)
- [Gemini CLI `GEMINI.md` context files](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html)
- [OpenCode instructions](https://dev.opencode.ai/v2/docs/instructions/)

Documentation establishes only the instruction-loading surface. It does not prove
that an agent will perform the full pre-change, post-change, validation, and
persistence lifecycle reliably. That stronger claim requires the independent test
listed above. Contributors can run the shared
[independent integration test](INTEGRATION_TESTING.md) and report PASS, PARTIAL,
or FAIL evidence through the repository issue form.

## Adapter selection and precedence

Use an explicit identifier for deterministic setup:

```sh
npx --no-install durable-subconscious setup . --agent codex
```

`--agent auto` recognizes a bounded set of environment markers and refuses absent
or ambiguous results. It never chooses based on existing instruction filenames,
because a repository can legitimately contain rules for multiple tools.

Codex, Cursor, and OpenCode all use root `AGENTS.md`, so they share one adapter,
one recovery record, and one managed block. Claude Code, GitHub Copilot, and Gemini
CLI each use their own official instruction file. Setup writes only the selected
adapter. Existing content remains authoritative outside the managed block, and the
loader explicitly supplements rather than replaces project rules.

## Recovery and removal

Run `integrate <agent> --remove` to remove only the managed block while retaining
later project edits. Run `integrate <agent> --restore` to restore the exact original
instruction file only when it has not diverged. Backups are hash checked; malformed
or duplicate markers and unsafe recovery states fail closed.

Removing an adapter never deletes `.durable-subconscious/` project knowledge.
Deleting that directory is a separate project-data and retention decision.
