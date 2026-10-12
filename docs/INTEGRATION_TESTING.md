# Independent agent integration test

This is the single acceptance protocol for Claude Code, Cursor, GitHub Copilot,
Gemini CLI, and OpenCode. It tests whether an actual agent—not merely its adapter
file—consults and maintains Durable Subconscious across fresh sessions.

Codex passed this protocol for v0.3.0. The five environments above remain
agent-session **UNVERIFIED** until evidence from this complete protocol is reviewed.

## Result definitions

- **PASS:** every required observation below is supported by newly executed,
  sanitized evidence.
- **PARTIAL:** setup or some lifecycle behavior worked, but one or more required
  observations are missing or needed unexpected manual prompting.
- **FAIL:** installation, preservation, mapping, retrieval, impact analysis,
  maintenance, or validation failed.

Generating the expected instruction file is adapter evidence, not a PASS.

## Before starting

Use an unfamiliar synthetic, public, or disposable project that has source code,
at least one dependency relationship, and executable tests. Do not use private
source or production data in a public report.

Record:

- agent name, exact version, and interface;
- operating system, Node.js version, and shell;
- target-project commit and its pre-existing instruction files;
- Durable Subconscious version or commit;
- clean `git status --short` output.

The agent under test must not have seen the project in an earlier session. Preserve
a before-test copy or commit so instruction and project-data preservation can be
verified afterward.

## Session 1 — install and map

1. Install from the public repository:

   ```sh
   npm install --save-dev github:RecursiveSeed/durable-subconscious
   ```

2. Start a fresh agent session and give it only the exact setup prompt from the
   README's [One-prompt setup](../README.md#one-prompt-setup).
3. Let the agent finish without supplying graph internals or a second lifecycle
   prompt. Ordinary approval prompts required by the agent are acceptable and must
   be reported.
4. Capture sanitized evidence that the agent:
   - selected the correct adapter;
   - preserved existing project instructions;
   - inspected real source, tests, configuration, and accepted project documents;
   - created evidence-backed graph nodes, edges, capabilities, maps, and explicit
     gaps where relationships were unknown;
   - ran project tests, strict validation, and representative impact queries.
5. Record the resulting graph summary and `git diff --stat`.
6. End the agent session completely.

## Session 2 — uncued maintenance

1. Start a new agent session in the same project.
2. Give one ordinary, bounded feature or bug-fix request. Do **not** mention Durable
   Subconscious, its instruction file, the graph, impact analysis, or maintenance.
3. Observe whether the agent automatically:
   - reads the persistent project instruction and existing knowledge;
   - runs an impact query before changing files;
   - inspects the returned owners, consumers, tests, risks, and unknown frontiers;
   - implements and tests the requested change;
   - updates graph relationships and maps when the evidence changed;
   - runs validation and a post-change impact query before finishing.
4. Record every unexpected manual prompt needed to make those steps happen. A
   reminder to read or maintain the subconscious makes the result PARTIAL, because
   automatic fresh-session behavior is the behavior under test.
5. End the session completely.

## Session 3 — persistence retrieval

Start one more fresh session. Ask a read-only architectural question about the
owner, dependency path, or protection for the capability changed in Session 2.
Do not mention the graph. Capture whether the answer consults the persisted project
knowledge and accurately cites current project evidence.

## Final checks

Run and record:

```sh
npx --no-install durable-subconscious check --project . --strict-coverage
npx --no-install durable-subconscious impact <changed-file-or-capability> --project .
npm test
git status --short
```

Use the project's actual test command when it is not `npm test`. Compare the final
instruction files and unrelated project data with the before-test copy. Confirm
that only the selected adapter was installed and that project knowledge survived
all session restarts.

## Report the result

Open an **Independent integration test** issue and complete every field. Include
sanitized commands, outputs, session boundaries, graph summaries, unexpected
manual steps, and failures. Link public fixture commits when available.

Do not include credentials, personal data, private graphs, proprietary code, or
machine-specific paths. Do not label an integration verified based only on
documentation, adapter tests, or a successful first session.
