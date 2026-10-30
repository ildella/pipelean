# Duplication gate

`yarn dup` runs two plain commands and fails if either finds something:

```
jsinspect ./src --threshold 60
jscpd src --min-tokens 50 --threshold 1 --reporters console,html,json
```

Both numbers are relaxed so the gate is green today while the sync/async twins
(`series`/`seriesSync`, `scan`/`scanSync`, `tryCatch`/`tryCatchSync`) get paid
down. Tighten a knob in the same commit that earns it, never before:

| knob | currently | target | today |
|---|---|---|---|
| jsinspect `--threshold` (nodes) | 60 | 30 (default) | 3 matches at 40 |
| jscpd `--threshold` (%) | 1 | 0 | 0.83% (1 clone) |

The item-error handling, the call-argument parsing, the fold setup and the
`enrich` pipeline are shared now (`src/run.js`, `src/enrich.js`,
`src/strategy.js`), which took jscpd from 8.19% (6 clones) to 0.83% (1 clone)
and jsinspect from a 120-node match to nothing below 60 nodes.

Next dedupe targets, in order: the `runSyncStrategy`/`runAsyncStrategy` loop
shells (they are the 40-node matches), then the remaining `runScan`/`runScanSync`
head (the last jscpd clone).
