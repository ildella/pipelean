---
name: "Pipelean Core"
description: "Pipelean core functionalities for iteration, composition and error management for pure FP in pure Javascript. Use this skill when you need to perform sequential async operations, concurrent fork/join over named tasks, control enrich, error handling, or batch processing using the `pipelean` library"
---

Shipped with the npm package (`docs/`, `skills/`). Tests are **not** published — do not look for `tests/` in `node_modules`. Full contracts live in [docs/reference.md](../../docs/reference.md) (or [online](https://github.com/ildella/pipelean/blob/master/docs/reference.md)). Recipes: [docs/patterns.md](../../docs/patterns.md).

## series — the default iterator

```
series(items, fn, opts?)            // immediate
series(fn, opts?) => (items) => …   // curried
```

Consumes **arrays and async iterables** (`for await` — generators, paging sources). Sequential. Sync or async `fn(item, index)`. Return `undefined` to drop the item.

```js
import {series, collect} from 'pipelean'

async function* pages() {
  yield {id: 1}
  yield {id: 2}
}

const {results, errors, sourceErrors, failure} = await series(
  pages(),
  page => importPage(page),
  {
    strategy: collect,
    pause: 200,
    onProgress: ({item, result, index, total}) => {
      // live, awaited, per kept item — total omitted when unknown
      updateBar(index + 1, total)
    },
    onError: ({item, error}) => report(item, error),
    onSourceError: ({error, index}) => log.warn('source died', {error, index}),
  },
)
```

**Options**

| Option | Role |
|---|---|
| `strategy` | `collect` (default), `failFast`, `failLate`, `skip`, `rethrow` |
| `onProgress({item, result, index, total?})` | After each **kept** success. Awaited. Not called for errors or `undefined` drops. |
| `onError({item, error, index, total?})` | Telemetry for handled item errors. Does not change control enrich. |
| `onFailure(failure)` | When `failure` is truthy. |
| `onSourceError({error, index})` | Iterable itself threw (dead generator). Never under `rethrow`. |
| `pause` | Number of ms, or `(item, index) => number \| Promise<number>`, after each success (and after `skip`) — rate limit. A non-positive/`undefined`/`NaN` result means no wait. |
| `pauseOnErrors` | Also pause after collected errors (default `false`). |
| `signal` | `AbortSignal` checked before each item and during `pause`. Aborting ends cleanly (`failure: false`, no `sourceErrors`), keeping completed results; it never interrupts the in-flight mapper or `source.next()`. |
| `take` | Process only the first N items. |
| `total` | Planned count for callbacks. Else cheap `items.length`. With `take`: `Math.min(take, known)`. Omitted when unknown. |

**Return**: `{results, errors, sourceErrors, failure}`

`filter` inherits every `series` option (it *is* `series` with a keep/drop transform). `scan` / `reduce` do **not** have `onProgress` or `take`, but they do support `pause`, `pauseOnErrors` and `signal` (fold `pause` gets `(accumulator, item, index)`). `recover` exists only on the folds — see below.

## Other functions

1. **`scan(iterable, scanner, initialValue, opts?)`**: Fold over **items**, keeping every intermediate accumulator. `scanner(acc, item, index)`. Default strategy `failFast` (which clears `results` on failure). Returns `{results, errors, sourceErrors, failure}`. No `onProgress`/`take`; supports `pause`, `pauseOnErrors`, `signal`, `recover`.
2. **`reduce(iterable, scanner, initialValue, opts?)`**: Fold over **items**, final accumulator only: `{value, errors, sourceErrors, failure}`. Same engine and default strategy as `scan`. Supports `recover`.
3. **`filter(items, predicate, opts?)`** or **`filter(predicate, opts?)`**: Keep original items where predicate is truthy. Patterns via `where()`. Same opts as `series`.
4. **`pipe(...fns)`**: Left-to-right composition. `undefined` short-circuits remaining steps (drop signal).
5. **`enrich(operations, opts?)`**: Fold over **steps** for **one** input. It is `reduce` over the operations: `enrich(ops)(input) === reduce(ops, (s, op) => ({...s, ...op(s)}), input)`. Options are bound at `enrich(ops, opts)`, not at call time. Each `op(state)` returns an object patch (shallow-merged). Returns `(initialState) => Promise<{value, errors, failure}>`. Use `enrichSync` when everything is sync.
6. **`join(tasks, opts?)`**: Fork/join over a record of **named** async tasks (not a collection). Every branch starts immediately; waits for all to settle. Returns `Promise<{value, errors, failure}>` where `value` maps successful branch names to their values and `errors` holds `{operation, error, index}` for failures (declaration order). `task(key, index)`, sync or async. Options: `strategy` (default `collect`), `onError`, `onFailure`. `failFast` behaves as `failLate` (branches cannot be stopped without an `AbortSignal`). For a concurrent map over a homogeneous collection use p-map, not `join`.
7. **`retry(fn, {attempts, delay})`**: Retry on every throw. Defaults `{attempts: 3, delay: 0}`.
8. **`tryCatch(fn, {onStart, onSuccess, onError, onFinally})`**: Single-function lifecycle. Returns `undefined` on error (the drop signal), so it short-circuits `pipe` and drops the item in `series`.
9. **`assertOk(result)`**: Guard an otherwise ignored outcome. Returns the same result when `failure` is falsy; throws `Error('pipelean: operation failed')` with `cause` (the underlying error, or the first error of a `failLate` aggregate) and `failure` when `failure` is truthy. Checks `failure`, not `errors`: `collect` / `skip` results pass through. Synchronous; works on async and sync results.
10. **`where(pattern)`**: Strict-equality object predicate. Used with `filter` / `findSync`.
11. **`assign(property, parse)`**: `enrich` step. Sets `{[property]: value}` unless `parse(state)` is `undefined` (returns `{}`).
12. **`stopWhen(items, predicate?)`** / **`stopWhenSync`**: Source adapter — stops pulling once the predicate `(item, index)` is truthy, checked before the item is yielded. Domain limits (`() => count >= limit`), content sentinels. Clean completion (`failure: false`, no sourceErrors), source cleanup still runs, predicate throws are source errors. Composes with every consumer: `series(fn, opts)(stopWhen(items, shouldStop))`. Not intra-item abort. **Lifecycle cancellation is `signal`**, not `stopWhen`; they compose.
13. **`*Sync`**: `seriesSync`, `filterSync`, `findSync`, `scanSync`, `reduceSync`, `pipeSync`, `enrichSync`, `tryCatchSync`. Same strategies and shapes, no Promises. `signal`, `pause` and `pauseOnErrors` are async-only: passing them throws a `TypeError`. No async iterables. `findSync` is sync-only early-exit: `{result, errors, sourceErrors, failure}`.

## Error strategies

- **`failFast`** (`fail`, `stopOnError`): stop now. `failure: {item, error, index}` (or source context `{error, index}`). Results cleared. In `join()` it is an alias of `failLate` — branches already started cannot be stopped.
- **`collect`**: continue, keep errors. `failure: false`. Default for `series`, `filter`, `enrich`.
- **`failLate`**: continue, then `failure: {errors}` if anything failed (item + source errors merged).
- **`skip`**: ignore errors (`errors` stays empty). `onError` still fires. `failure: false`.
- **`rethrow`**: throw the original error. No structured result. No `onError` / `onFailure` / `onSourceError` — except for a fold item error when `recover` is present: recovery handles it, so `onError` fires before the seam.

## Fold recovery (`recover`)

`scan` / `reduce` (+ `scanSync` / `reduceSync`) accept `recover`, a seam between the scanner error and the strategy. It receives `{error, item, index, state, total?}` — `state` is the accumulator passed *into* the scanner — and returns the **next accumulator** (not a patch; may be async in async folds).

```js
import {reduce, rethrow, forever} from 'pipelean'

await reduce(forever(), async state => {
  const results = await runner.sync({full: state.full})   // may throw
  writeRound({results, io})
  return {...state, full: false, failures: failedRound(results) ? state.failures + 1 : 0}
}, {failures: 0, full: true}, {
  signal: controller.signal,
  strategy: rethrow,
  onError: ({error}) => io.stderr.write(`${error.message}\n`),
  recover: ({state}) => ({...state, full: false, failures: state.failures + 1}),
  pause: state => backoffWait({base: everyMs, failures: state.failures}),
})
```

Rules:

- `onError` fires first, even under `rethrow`; without `recover`, `rethrow` stays silent as always.
- A recovered error is **consumed**: `errors` empty, `failure: false`, no `onFailure`, and `scan` pushes the recovered accumulator into `results`.
- If `recover` throws, that error becomes the item error and the strategy applies (two `onError` reports are possible: the original, then the recover error).
- Source errors bypass `recover`; a throwing `pause` is a source/config error, not recoverable.
- `pause` runs after a recovery regardless of `pauseOnErrors` and sees the recovered state. An abort during recovery keeps the accumulator, skips the pause, stops.
- Fold-only: `series`, `filter`, `findSync`, `enrich`, `join`, `pipe` throw a `TypeError` on `recover`. Sync folds require it to be synchronous (a thenable is a `TypeError`).

**Which error tool?**

| Tool | Scope | What it does |
|---|---|---|
| `recover` | one fold item | error → **next accumulator**, keep folding |
| `strategy: collect` | whole run | record it, continue with the **previous** accumulator |
| `tryCatch` | one function | swallow, return `undefined` (drop signal) |
| `retry` | one function | retry the call, then rethrow |
| `assertOk` | one finished result | throw when `failure` is truthy, preserving the `cause` |

## Which fold? (read this before writing state)

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

`series` = many items, independent. `pipe` = one value, value-in/value-out. `join` = named concurrent tasks.

## enrich() vs pipe()

- `enrich()`: stateful accumulation. Each step sees the full state and returns a patch. Pipeline defined once, reused. `{value, errors, failure}`.
- `pipe()`: value-in / value-out. Returns a Promise (or value, for `pipeSync`).

```js
import {enrich} from 'pipelean'

const processAlbum = enrich([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
  state => ({artists: state.artists ?? []}),
])

const {value, errors, failure} = await processAlbum(input)
```

`enrich()` error shapes: `{operation, error, index}` (`operation` is `fn.name` or `operation-${index}`). `failLate` failure is `{errors}`.

**Documentation**: [docs/reference.md](../../docs/reference.md) · [docs/patterns.md](../../docs/patterns.md) · [docs/guide.md](../../docs/guide.md)
