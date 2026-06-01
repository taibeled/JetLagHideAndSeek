# Performance Replay Suite

`pnpm perf:test` runs deterministic offline performance replays for the map and
question geometry hot paths. It is intentionally separate from Jest: replay
timings are advisory measurements, while Jest remains the correctness gate.

## Commands

```bash
pnpm perf:capture
pnpm perf:test
pnpm perf:test -- --scenario hiding-zone
pnpm perf:test -- --json perf/results/latest.json
pnpm perf:baseline
pnpm perf:compare -- --current perf/results/latest.json
pnpm perf:typecheck
```

`perf:capture` is the only command that accesses live services. Run it manually
when query semantics change or a reviewed fixture refresh is needed. It stores
the request, capture timestamp, attribution, response hash, byte count, and raw
payload under `perf/fixtures/`.

`perf:test` installs an outbound-network guard. A replay that reaches beyond the
tracked fixture corpus fails immediately.

## Interpreting Results

The suite records median, p95, minimum, and maximum durations together with a
canonical output digest and structural metrics such as output vertices and
serialized bytes. Compare runs made with the same fixture-manifest hash and a
similar machine.

The checked-in baseline is a reference snapshot, not a hard timing budget.
Digest changes require investigation. Timing regressions should become hard
gates only after CI history establishes realistic variance.
