# Synthetic inventory example

This fictional project demonstrates Durable Subconscious configuration and graph structure. All names, paths, facts, and data are synthetic.

From the Durable Subconscious repository root:

```sh
node bin/durable-subconscious.mjs check --project examples/synthetic-project --config subconscious/config.json
node bin/durable-subconscious.mjs impact inventory.state --project examples/synthetic-project --config subconscious/config.json
node bin/durable-subconscious.mjs discover --project examples/synthetic-project --config subconscious/config.json
node --test examples/synthetic-project/test/catalog.test.mjs
```
