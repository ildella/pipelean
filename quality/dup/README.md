# Duplication gate

`yarn dup` runs two plain commands and fails if either finds something:

```
jsinspect ./src --threshold 130
jscpd src --min-tokens 50 --threshold 9 --reporters console,html,json
```

Both numbers are relaxed so the gate is green today while the sync/async twins
(`series`/`seriesSync`, `scan`/`scanSync`, `tryCatch`/`tryCatchSync`) get paid
down. Tighten a knob in the same commit that earns it, never before:

| knob | currently | target | today |
|---|---|---|---|
| jsinspect `--threshold` (nodes) | 130 | 30 (default) | 1 match at 120 |
| jscpd `--threshold` (%) | 9 | 5 (default) | 8.19% |

Next dedupe targets, in order: the item-error `catch` block repeated three times
in `src/functional-sync.js` (`seriesSync`, `findSync`, `runScanSync`), then the
`run*Strategy` loop shells.
