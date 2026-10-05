# Migration Guide

How to replace common imperative and error-prone patterns with pipelean equivalents.

## 0.10.1: `stopWhen` source adapter

`stopWhen(items, predicate)` stops pulling from any iterable once the predicate is truthy, checked before the item is offered downstream. Additive — no migration needed, but delete your hand-rolled stop logic when you see it:

```js
// Before: a generator with inline checks (and cleanup tangled into finally)
async function * events () {
  for (const album of albums) {
    if (shouldStop())
      return
    yield await enrichOne(album)
  }
}

// After: cancellation lives in the source, work lives in the operation
await series(enrichOne, {pause: DELAY})(stopWhen(albums, shouldStop))
```

The predicate receives `(item, index)` and may close over cancel flags or counters (`() => count >= limit`). Stopping is a clean completion (`failure: false`), not an error; the abandoned source's cleanup still runs. See [stopWhen](reference.md#stopwhen).

Also in 0.10.1: iterable objects (generators, custom adapters) passed to `filter` / `filterSync` / `findSync` are now correctly treated as sources instead of `where()` patterns — `filter(pages(), pred)` used to silently misbehave.

## 0.8.4: Node engine requirement

Pipelean now requires Node `>22.7` (package.json `engines`).

## 0.8.3: removed `no-for-await-of` rule

The `pipelean/no-for-await-of` rule was dropped. Pipelean's position is now that `for await...of` inside yielding generators is fine; the rules target non-generator loops (`no-loop-without-yield`) and unsafe array iteration instead. Remove any reference to `pipelean/no-for-await-of` from your config or it will fail to resolve.

## 0.8.2: ESLint plugin ships a one-line config

The plugin now exports a ready-made flat-config object at `pipelean/eslint/config`, replacing the manual `plugins`/`rules` wiring. Every rule still defaults to `warn`.

**Before:**
```js
import pipeleanPlugin from 'pipelean/eslint'

export default [{
  plugins: {pipelean: pipeleanPlugin},
  rules: {
    'pipelean/no-array-foreach': 'warn',
    'pipelean/no-array-reduce': 'warn',
    'pipelean/no-loop-without-yield': 'warn',
    'pipelean/no-promise-combinators': 'warn',
  },
}]
```

**After:**
```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [pipeleanConfig]
```

To tighten individual rules, spread a second object after the config:

```js
export default [
  pipeleanConfig,
  {rules: {'pipelean/no-loop-without-yield': 'error'}},
]
```

## 0.8.1: new `assign()` helper

`assign(property, parse)` builds a `flow()` step that conditionally sets a property on the accumulated state, skipping it (no-op) when `parse(state)` returns `undefined`. Additive:

```js
import { assign, flow } from 'pipelean'

const extractYear = assign('year', state => {
  const n = Number.parseInt(state.rawYear, 10)
  return Number.isNaN(n) ? undefined : n
})

const {value} = await flow([extractYear])({rawYear: '1995'})
// value = {rawYear: '1995', year: 1995}
```

## 0.8.0: new `flow()` function

`flow()` runs a reusable pipeline of state-enrichment steps over one accumulated value, returning `{value, errors, failure}` with the same error strategies as `series()`/`scan()`. Additive — no migration needed, but replace hand-rolled accumulator patterns when you see them:

```js
// Before: hand-rolled accumulation
const step1 = prepare(input)
const step2 = {...step1, ...enrich(step1)}
const step3 = {...step2, ...finalize(step2)}

// After: flow() defines the pipeline once and reuses it
import { flow } from 'pipelean'
const process = flow([prepare, enrich, finalize])
const {value} = await process(input)
```

`flowSync` is available too for synchronous pipelines.

## 0.7.1: `scanReduce()` → `reduce()`

`scanReduce` was renamed to `reduce` as the main API. `scanReduce` and `scanReduceSync` are kept as aliases pointing to the same functions, so existing code keeps working.

**Before:**
```js
import { scanReduce } from 'pipelean'
const {value: totalDuration} = await scanReduce(
  tracks,
  (accumulator, {duration}) => accumulator + duration,
  0,
)
```

**After:**
```js
import { reduce } from 'pipelean'
const {value: totalDuration} = await reduce(
  tracks,
  (accumulator, {duration}) => accumulator + duration,
  0,
)
```

Same change for the sync variant: `scanReduceSync` → `reduceSync`. Behavior is identical — `reduce()` is `scan()` with `storePartialResults: false` baked in, returning only the final value.

## 0.7: `series()` callbacks receive context objects

Pipelean 0.7 changes `series()` lifecycle callbacks from raw values to named context objects. This is a breaking change, but it makes app tasks easier to write because UI progress and error reporting get the item, index, result/error, and known total in one place.

### `onProgress(result)` → `onProgress({result})`

**Before:**
```js
await series(items, fn, {
  onProgress: result => updateUi(result),
})
```

**After:**
```js
await series(items, fn, {
  onProgress: ({result}) => updateUi(result),
})
```

The full progress payload is:

```js
{item, result, index, total}
```

`total` is omitted when Pipelean cannot know it cheaply. Pass `total` explicitly when the planned count comes from your app:

```js
await series(items, fn, {
  total: items.length,
  onProgress: ({index, total}) => updateProgress(index + 1, total),
})
```

If `take` is set, callback `total` means planned execution total:

```js
await series(items, fn, {
  take: 10,
  total: 100,
  onProgress: ({total}) => {
    // total is 10
  },
})
```

### `onError(error)` → `onError({error})`

**Before:**
```js
await series(items, fn, {
  strategy: collect,
  onError: error => report(error),
})
```

**After:**
```js
await series(items, fn, {
  strategy: collect,
  onError: ({item, error, index}) => report({item, error, index}),
})
```

Collected errors now also include `index`:

```js
const {errors} = await series(items, fn, {strategy: collect})
// errors = [{item, error, index}]
```

### `failFast` failure includes `index`

**Before:**
```js
const result = await series(items, fn, {strategy: failFast})
// result.failure = {item, error}
```

**After:**
```js
const result = await series(items, fn, {strategy: failFast})
// result.failure = {item, error, index}
```

`onFailure` receives the same shape:

```js
await series(items, fn, {
  strategy: failFast,
  onFailure: ({item, error, index}) => showItemError(item, error, index),
})
```

### `failLate` failure changes from `true` to `{errors}`

**Before:**
```js
const result = await series(items, fn, {strategy: failLate})

if (result.failure === true) {
  showToast('Some items failed')
}
```

**After:**
```js
const result = await series(items, fn, {strategy: failLate})

if (result.failure) {
  showToast(`${result.failure.errors.length} items failed`)
}
```

`onFailure` receives `{errors}`:

```js
await series(items, fn, {
  strategy: failLate,
  onFailure: ({errors}) => showToast(`${errors.length} items failed`),
})
```

### `throw` does not call lifecycle callbacks

In `series()`, `throw` now throws the original error immediately and does not call `onError` or `onFailure`.

```js
await series(items, fn, {
  strategy: rethrow,
  onError: () => {
    // not called
  },
  onFailure: () => {
    // not called
  },
})
```

### App task progress example

```js
const albumsToSync = await getAlbumsByStatus({statusFilter})

const result = await series(albumsToSync, album => importAlbum({
  sourceId: album.sourceId,
  libraryId: album.libraryId,
  fast,
}), {
  take: limit,
  strategy: collect,
  onProgress: ({index, total}) => {
    operation.sync.total = total
    operation.sync.current = index + 1
  },
  onError: ({item, error}) => {
    reportAlbumImportError({
      sourceId: item.sourceId,
      title: item.title,
      name: error.name,
      content: error.message,
    })
  },
})
```

## for-loop with try/catch → series

**Before:**
```js
const results = []
const errors = []
for (const item of items) {
  try {
    results.push(await process(item))
  } catch (e) {
    errors.push({item, error: e})
  }
}
```

**After:**
```js
import { series, collect } from 'pipelean'
const { results, errors } = await series(items, process, { strategy: collect })
```

## .forEach() with async → series

**Before:**
```js
items.forEach(async (item) => {
  await process(item) // errors silently swallowed!
})
```

**After:**
```js
import { series } from 'pipelean'
await series(items, process)
```

## .reduce() → scan

**Before:**
```js
const total = await items.reduce(async (acc, item) => {
  const sum = await acc
  return sum + (await getValue(item))
}, Promise.resolve(0))
```

**After:**
```js
import { scan } from 'pipelean'
const { results } = await scan(items, (acc, item) => acc + getValue(item), 0)
```

## .filter().map() (two passes) → series with pipe

**Before:**
```js
const result = items.filter(x => x.active).map(x => x.name)
// For async: two passes, no error handling
```

**After:**
```js
import { series, pipe } from 'pipelean'
const { results } = await series(items, pipe(
  x => x.active ? x : undefined,  // filter: drop inactive
  x => x.name,                     // transform: extract name
))
```

## Promise.all() → series with collect

**Before:**
```js
// All fail if one fails, or .allSettled for collection
const results = await Promise.all(items.map(fn))
```

**After:**
```js
import { series, collect } from 'pipelean'
const { results, errors } = await series(items, fn, { strategy: collect })
```

## Promise.allSettled() → series with collect, or join for named tasks

**Before:**
```js
const results = await Promise.allSettled(items.map(fn))
// Must manually unpack {status, value, reason} per item
```

**After (positional collection — sequential):**
```js
import { series, collect } from 'pipelean'
const { results, errors } = await series(items, fn, { strategy: collect })
// Structured result: results and errors already separated
```

**After (named, heterogeneous tasks — run concurrently):**
```js
import { join } from 'pipelean'
const { value, errors } = await join({
  api: () => ping('api.example.com'),
  cdn: () => ping('cdn.example.com'),
})
// value keeps the successes by name; errors names each failed branch
```

Unlike `series` (sequential), `join` runs its branches at the same time — closer to the *intent* of `Promise.allSettled`, but with a structured `{value, errors, failure}` result instead of manual `{status, value, reason}` unpacking.

## Manual retry logic → retry

**Before:**
```js
async function withRetry(fn, attempts = 3, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (e) {
      if (i === attempts - 1) throw e
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}
```

**After:**
```js
import { retry } from 'pipelean'
const robustFn = retry(fn, { attempts: 3, delay: 1000 })
```

## .then().catch() chain → tryCatch

**Before:**
```js
fetch(url)
  .then(res => res.json())
  .catch(e => logError(e))
```

**After:**
```js
import { tryCatch } from 'pipelean'
const safeFetch = tryCatch(fetchJSON, { onError: logError })
```

## ESLint Plugin

Enable the rules to catch these patterns at lint time:

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [pipeleanConfig]
```
