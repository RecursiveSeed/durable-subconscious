# Contributing

Thank you for improving Durable Subconscious.

## Choose the right report

- Use the **Bug report** issue form for reproducible incorrect behavior.
- Use the **Feature request** issue form for a bounded problem the existing scope
  does not solve.
- Use the **Independent integration test** form after following
  [the shared acceptance protocol](docs/INTEGRATION_TESTING.md).
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Sanitize every report. Never attach private project graphs, credentials, personal
data, proprietary source, or machine-specific paths. A small synthetic
reproduction is preferred.

## Before opening a change

- Keep the system local, dependency-light, and project-independent.
- Preserve the typed graph semantics and evidence-first behavior.
- Preserve the separation between structural validity, evidence freshness, and
  semantic correctness. Read-only operations must never advance a trust baseline.
- Do not add real project graphs, private evidence, credentials, personal data, local paths, generated runtime knowledge, or proprietary fixtures.
- Use synthetic fixtures for tests and documentation.
- Do not weaken a validator merely to make a graph pass. Represent genuine uncertainty as an explicit, evidence-backed gap.
- Avoid new packages, services, and frameworks unless the need and licensing implications are documented.

## Development workflow

1. Create a focused branch.
2. Make the smallest coherent change.
3. Add or update tests.
4. Run `npm test`, `npm run check:example`, and the freshness regression family
   when evidence, discovery, impact, or reconciliation behavior changes.
5. Confirm `git status --short` contains no local knowledge, secrets, logs, caches, or generated data.
6. Explain behavior changes, compatibility impact, tests executed, and remaining uncertainty in the pull request.

Open a pull request against `main` and complete the repository pull-request
template. Keep unrelated changes out of the branch. Maintainers may ask for a
smaller reproduction or additional evidence before reviewing an implementation.

## Licensing contributions

Contributions are accepted under this repository's `AGPL-3.0-only` license. Only
submit work you have the right to license on those terms, and identify any copied
or generated material whose license requires review.

The maintainers may consider separate commercial licensing in the future. A pull
request does **not** by itself assign your copyright or grant separate proprietary
relicensing rights. If a contribution is intended to be available under additional
commercial terms, coordinate with the maintainers before substantial work; that
would require a separate written agreement. No commercial license or contributor
agreement is required for ordinary AGPL-only contributions today.
