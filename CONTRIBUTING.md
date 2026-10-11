# Contributing

Thank you for improving Durable Subconscious.

## Before opening a change

- Keep the system local, dependency-light, and project-independent.
- Preserve the typed graph semantics and evidence-first behavior.
- Do not add real project graphs, private evidence, credentials, personal data, local paths, generated runtime knowledge, or proprietary fixtures.
- Use synthetic fixtures for tests and documentation.
- Do not weaken a validator merely to make a graph pass. Represent genuine uncertainty as an explicit, evidence-backed gap.
- Avoid new packages, services, and frameworks unless the need and licensing implications are documented.

## Development workflow

1. Create a focused branch.
2. Make the smallest coherent change.
3. Add or update tests.
4. Run `npm test` and `npm run check:example`.
5. Confirm `git status --short` contains no local knowledge, secrets, logs, caches, or generated data.
6. Explain behavior changes, compatibility impact, tests executed, and remaining uncertainty in the pull request.

Contributions are accepted under this repository's `AGPL-3.0-only` license.
