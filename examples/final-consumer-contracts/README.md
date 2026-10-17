# Signal Harbor final-consumer fixture

Signal Harbor is a completely fictional project used to verify behavioral-contract
retrieval. A shared beacon producer feeds two consumers with intentionally
different obligations:

- the control panel must display an uppercase status and accessible label;
- the archive feed must preserve the lowercase machine value; and
- both consumers must preserve the beacon identity.

The producer test is deliberately shallow. Setting
`SIGNAL_HARBOR_PANEL_REGRESSION=1` leaves that test passing while the control-panel
final-consumer test fails. This demonstrates why a passing upstream test is not
proof of downstream behavior.

Run the focused checks from the repository root:

```sh
node --test examples/final-consumer-contracts/test/producer.test.mjs
node --test examples/final-consumer-contracts/test/control-panel.test.mjs
node --test examples/final-consumer-contracts/test/archive-feed.test.mjs
node bin/durable-subconscious.mjs impact module.beacon-source --project examples/final-consumer-contracts --config subconscious/config.json
```

The committed evidence records are deterministic synthetic fixture data, not
performance claims or reports from another project. The panel's human-visible
acceptance remains intentionally UNKNOWN in the base graph.
