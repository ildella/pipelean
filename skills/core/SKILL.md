---
name: "Pipelean Core"
description: "Pipelean core functionalities for iteration, composition and error management for pure FP in pure Javascript. Use this skill when you need to perform sequential async operations, concurrent fork/join over named tasks, control flow, error handling, or batch processing using the `pipelean` library"
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
| `onError({item, error, index, total?})` | Telemetry for handled item errors. Does not change control flow. |
| `onFailure(failure)` | When `failure` is truthy. |
| `onSourceError({error, index})` | Iterable itself threw (dead generator). Never under `rethrow`. |
| `pause` | ms after each success (and after `skip`) — rate limit. |
| `pauseOnErrors` | Also pause after collected errors (default `false`). |
| `take` | Process only the first N items. |
| `total` | Planned count for callbacks. Else cheap `items.length`. With `take`: `Math.min(take, known)`. Omitted when unknown. |

**Return**: `{results, errors, sourceErrors, failure}`

`filter` inherits every `series` option (it *is* `series` with a keep/drop transform). `scan` / `reduce` do **not** have `onProgress`, `pause`, or `take`.

## Other functions

2. **`scan(iterable, scanner, initialValue, opts?)`**: Stateful sequential transform. `scanner(acc, item, index)`. Default strategy `failFast`. Returns `{results, errors, sourceErrors, failure}`.
3. **`reduce(iterable, scanner, initialValue, opts?)`**: Like `scan` but `{value, errors, sourceErrors, failure}` — final accumulator only.
4. **`filter(items, predicate, opts?)`** or **`filter(predicate, opts?)`**: Keep original items where predicate is truthy. Patterns via `where()`. Same opts as `series`.
5. **`pipe(...fns)`**: Left-to-right composition. `undefined` short-circuits remaining steps (drop signal).
6. **`flow(operations, opts?)`**: Stateful accumulation across **one** input. Options are bound at `flow(ops, opts)`, not at call time. Each `op(state)` returns an object patch. Returns `(initialState) => Promise<{value, errors, failure}>`. Use `flowSync` when everything is sync.
7. **`join(tasks, opts?)`**: Fork/join over a record of **named** async tasks (not a collection). Every branch starts immediately; waits for all to settle. Returns `Promise<{value, errors, failure}>` where `value` maps successful branch names to their values and `errors` holds `{operation, error, index}` for failures (declaration order). `task(key, index)`, sync or async. Options: `strategy` (default `collect`), `onError`, `onFailure`. `failFast` behaves as `failLate` (branches cannot be stopped without an `AbortSignal`). For a concurrent map over a homogeneous collection use p-map, not `join`.
8. **`retry(fn, {attempts, delay})`**: Retry on every throw. Defaults `{attempts: 3, delay: 0}`.
9. **`tryCatch(fn, {onStart, onSuccess, onError, onFinally})`**: Single-function lifecycle. Returns `null` on error.
10. **`where(pattern)`**: Strict-equality object predicate. Used with `filter` / `findSync`.
11. **`assign(property, parse)`**: `flow` step. Sets `{[property]: value}` unless `parse(state)` is `undefined` (returns `{}`).
12. **`stopWhen(items, predicate?)`** / **`stopWhenSync`**: Source adapter — stops pulling once the predicate `(item, index)` is truthy, checked before the item is yielded. Cancel flags, limits (`() => count >= limit`), content stops. Clean completion (`failure: false`, no sourceErrors), source cleanup still runs, predicate throws are source errors. Composes with every consumer: `series(fn, opts)(stopWhen(items, shouldStop))`. Not intra-item abort.
12. **`*Sync`**: `seriesSync`, `filterSync`, `findSync`, `scanSync`, `reduceSync`, `pipeSync`, `flowSync`, `tryCatchSync`. Same strategies and shapes, no Promises. No `pause` (needs async delay). No async iterables. `findSync` is sync-only early-exit: `{result, errors, failure}`.

## Error strategies

- **`failFast`** (`fail`, `stopOnError`): stop now. `failure: {item, error, index}` (or source context `{error, index}`). Results cleared. In `join()` it is an alias of `failLate` — branches already started cannot be stopped.
- **`collect`**: continue, keep errors. `failure: false`. Default for `series`, `filter`, `flow`.
- **`failLate`**: continue, then `failure: {errors}` if anything failed (item + source errors merged).
- **`skip`**: ignore errors (`errors` stays empty). `onError` still fires. `failure: false`.
- **`rethrow`**: throw the original error. No structured result. No `onError` / `onFailure` / `onSourceError`.

## flow() vs pipe()

- `flow()`: stateful accumulation. Each step sees the full state and returns a patch. Pipeline defined once, reused. `{value, errors, failure}`.
- `pipe()`: value-in / value-out. Returns a Promise (or value, for `pipeSync`).

```js
import {flow} from 'pipelean'

const processAlbum = flow([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
  state => ({artists: state.artists ?? []}),
])

const {value, errors, failure} = await processAlbum(input)
```

`flow()` error shapes: `{operation, error, index}` (`operation` is `fn.name` or `operation-${index}`). `failLate` failure is `{errors}`.

**Documentation**: [docs/reference.md](../../docs/reference.md) · [docs/patterns.md](../../docs/patterns.md) · [docs/guide.md](../../docs/guide.md)
