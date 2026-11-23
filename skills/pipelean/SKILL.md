---
name: pipelean
description: Use when a project depends on `pipelean`, or when writing or reviewing sequential async iteration, batch/import jobs, rate-limited loops, daemon loops with backoff, cancellation (AbortSignal), error handling (strategies, retry, tryCatch), folds/accumulators, enrichment pipelines, or named concurrent tasks. Replaces hand-rolled forEach, for-loops with try/catch, Promise.all/allSettled, async .map and Array.reduce. Also use when a `pipelean/*` ESLint rule fires. Do not use in projects without pipelean in package.json.
---

Contracts ship with the package (`docs/` inside `node_modules/pipelean`). Tests are not published.

## 1. Bug or data?

- Failure means "cannot happen" → it must throw: `foldSync`, `mapSeries` / `mapSeriesSync`, or `{strategy: rethrow}` at an async I/O boundary (daemon, command exit).
- Failure means "this record is bad" → managed strategy on `series`, `reduce`, `scan`, `enrich`, `join`.
- Result already managed and you need the value → `assertOk(result).value`.

## 2. Pick the tool

| Instead of | Use |
|---|---|
| `forEach`, loop + `try/catch`, many independent items | `series` |
| async `.map` that must throw on first failure | `mapSeries` / `mapSeriesSync` |
| `Promise.all` / `allSettled` on named tasks | `join` |
| `.reduce`, pure sync (sums, counts, indexes) | `foldSync` |
| `.reduce`, async or report needed | `reduce` |
| `.reduce`, every intermediate matters | `scan` |
| nested spreads threading state through steps | `enrich` |
| value in → value out, may bail | `pipe` |
| `if (failure) throw failure.error` | `assertOk(result)` |
| lazy producer | plain generator that yields (loops allowed only there) |

Fold over **items** → `scan` / `reduce` / `foldSync`. Fold over **steps** of one input → `enrich`.
Many items with a concurrent map over a homogeneous collection: use p-map, not `join`.

## 3. series and its options

```js
import {series, collect} from 'pipelean'

const {results, errors, sourceErrors, failure} = await series(pages(), importPage, {
  strategy: collect,
  pause: 200,
  onProgress: ({index, total}) => updateBar(index + 1, total),
  onError: ({item, error}) => report(item, error),
  onSourceError: ({error, index}) => log.warn('source died', {error, index}),
})
```

Also curried: `series(fn, opts)(items)`. Accepts arrays and async iterables.

- `strategy`, `onError`, `onFailure`, `onSourceError`, `pause` (ms or fn), `pauseOnErrors`, `signal`, `take`, `total`, `onProgress` (after each kept success only).
- `signal` checked before each item and during `pause`; abort ends cleanly (`failure: false`), never interrupts the in-flight mapper.
- `filter` inherits every `series` option. `scan` / `reduce`: no `onProgress`/`take`; they support `pause`, `pauseOnErrors`, `signal`, `recover`.
- `mapSeries`: passes everything through **except** `onError`/`onFailure`/`onSourceError` and any strategy other than `rethrow`, which throw `TypeError`.

## 4. Strategies

| strategy | `errors` | `failure` | note |
|---|---|---|---|
| `collect` | all handled | `false` | default for `series`, `filter`, `enrich`, `join` |
| `failLate` | all handled | `{errors}` at end | |
| `failFast` | `[]` | `{item, error, index}` | default for `scan`, `reduce`; clears `scan` results (`reduce` keeps its last accumulator); in `join` = `failLate` |
| `skip` | `[]` | `false` | `onError` still fires |
| `rethrow` | throws original | — | no `onError`/`onFailure`/`onSourceError` (except fold with `recover`) |

Always state the strategy when the default is not the policy you mean.

## 5. Error tools

| Tool | Scope | Effect |
|---|---|---|
| `strategy: collect` | whole run | record, continue with the previous accumulator |
| `recover` (folds only) | one fold item | error → next accumulator, keep folding; error is consumed |
| `tryCatch` | one function | swallow, return `undefined`; a throwing `onError` propagates, `onFinally` still runs |
| `retry` | one function | retry (default 3), then rethrow |
| `assertOk` | one finished result | throws the original error (`failLate` → first error) with `.failure` attached; asserts no `failure`, not no `errors` |

`retry` / `tryCatch` wrap one function. They are not strategies.

`recover`: a recovered error is consumed (`errors` empty, `failure: false`); `onError` fires first, even under `rethrow`. Source errors bypass `recover`.

## 6. Rules that bite

- `undefined` drops the item in `series`, `filter`, `pipe`, `mapSeries`. In `enrich` it is an error: return `{}` for a no-op.
- Never extract a fold value with `{strategy: rethrow}`. `onError` next to `rethrow` never fires. (`no-fold-rethrow` flags it; `recover` in the options exempts it.)
- `foldSync`: sync only, exactly 3 arguments, throws the original error, `undefined` is a valid accumulator.
- `enrich`: steps return a non-null, non-array object patch, shallow-merged. Options bind at `enrich(ops, opts)`. Hooks: `onStepStart`, `onStepSuccess`; errors only on `onError`. In `enrichSync` hooks must be sync: an async rejection is never observed.
- `pipe` catches nothing. Only `undefined` short-circuits; `null`, `false`, `0`, `''` flow.
- `join`: named tasks, no cap, no cancellation.
- `stopWhen(items, pred)` / `stopWhenSync` end a source cleanly; `signal` is lifecycle cancellation. They compose.
- `*Sync` variants (`seriesSync`, `filterSync`, `findSync`, `scanSync`, `reduceSync`, `mapSeriesSync`, `pipeSync`, `enrichSync`, `tryCatchSync`): same shapes, no Promises, no async iterables, `signal`/`pause`/`pauseOnErrors` throw `TypeError`. `foldSync` has no async twin.

## 7. enrich, join and the daemon loop

```js
import {enrich, join} from 'pipelean'

const processAlbum = enrich([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
])
const {value, errors, failure} = await processAlbum(input)

const report = await join({api: () => ping('api.example.com'), cdn: () => ping('cdn.example.com')})
// report.value = {api, cdn}; a failed branch is {operation, error, index} in report.errors
```

Daemon loop: `reduce` over `forever()` ticks, with `signal` for shutdown, `pause` for backoff, `recover` so a failed round does not end the loop.

```js
import {reduce, rethrow, forever} from 'pipelean'

await reduce(forever(), async state => {
  const results = await runner.sync({full: state.full})
  return {...state, full: false, failures: failedRound(results) ? state.failures + 1 : 0}
}, {failures: 0, full: true}, {
  signal: controller.signal,
  strategy: rethrow,
  onError: ({error}) => log.warn(error.message),
  recover: ({state}) => ({...state, full: false, failures: state.failures + 1}),
  pause: state => backoffWait({failures: state.failures}),
})
```

## 8. Supporting cast

- `where(pattern)`: strict-equality object predicate for `filter` / `findSync`.
- `assign(property, parse)`: `enrich` step; sets `{[property]: value}` unless `parse(state)` is `undefined` (then `{}`).
- `findSync(items, pred)`: first match, early exit; `{result, errors, sourceErrors, failure}`.
- `forever()` / `foreverSync()`: unbounded ticks for daemon loops.
- `delay(ms)`: Promise-based wait.

## 9. When a `pipelean/*` rule fires

All rules default to `warn` in `pipelean/eslint/config`.

| rule | use instead |
|---|---|
| `no-array-foreach` | `series` |
| `no-array-reduce` | `foldSync` (pure sync) or `reduce` (report needed) |
| `no-array-map-async` | `series` / `mapSeries` |
| `no-promise-combinators` | `series` with a strategy; `join` for named tasks |
| `no-loop-without-yield` | generator source that yields (loops allowed only there) |
| `no-fold-rethrow` | `foldSync`; `recover` in the options exempts |

Return shapes: `series`/`filter`/`scan` `{results, errors, sourceErrors, failure}`; `reduce` `{value, errors, sourceErrors, failure}`; `enrich`/`join` `{value, errors, failure}`; `findSync` `{result, errors, sourceErrors, failure}`; `mapSeries` bare array; `foldSync` bare value.