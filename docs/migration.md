# Migration Guide

How to replace common imperative and error-prone patterns with pipelean equivalents.

## 0.15.1: `no-fold-rethrow` suggestion fixer

No behavior changes; no migration required. The `no-fold-rethrow` rule gained an
**opt-in editor suggestion** that performs the 0.15.0 fold codemod mechanically:
it rewrites the call to an existing plain or aliased `foldSync` binding (or to
`foldSync`), drops the `.value` read and, only when no named `foldSync` binding
exists, appends it to a named `pipelean` import; with namespace/default-only
imports (or none) that insertion is skipped, so the callee may need a manual
import. `eslint --fix` never applies it.

Limits: report only when the result is destructured, `.value` is a write target,
the result is read through any other member (`.failure`, `['value']`), the call
has more than four arguments, or a pipelean default/namespace import occupies the
local name `foldSync`. Aliased `reduceSync` imports and member calls still evade
the rule. A non-pipelean import or local declaration named `foldSync` is not
detected: the suggestion is still offered, and the editor preview shows the
collision its rewrite or import insert would produce.

## 0.15.0: `assertOk` throws the original error

0.15 carries **behavior changes** in two places and one new lint rule. They are
small, but they are not additive: code that matched on the old `assertOk` wrapper
or passed error callbacks to `mapSeries` must adapt. `enrichSync` async hooks
were already unobserved; that is now documented. Everything else keeps working.

### 1. `assertOk` throws the original error, not a wrapper

When `failure` is truthy, `assertOk` used to throw
`Error('pipelean: operation failed')` with the underlying error as `cause`. It now
throws the **original** error, with the structured failure attached as
`.failure`. Identity, message, stack and class (`instanceof`) survive.

```js
// Before (0.14)
import {assertOk, failFast, series} from 'pipelean'

try {
  assertOk(await series(jobs, importJob, {strategy: failFast}))
} catch (error) {
  console.log(error.message)        // 'pipelean: operation failed'
  console.log(error.cause)          // the original mapper error
  console.log(error instanceof TypeError) // false
}
```

```js
// After (0.15)
import {assertOk, failFast, series} from 'pipelean'

try {
  assertOk(await series(jobs, importJob, {strategy: failFast}))
} catch (error) {
  console.log(error.message)        // the original mapper error's message
  console.log(error)                // the same object the mapper threw
  console.log(error.failure)        // {item, error, index}
  console.log(error instanceof TypeError) // true, when the mapper threw one
}
```

What to change:

- **Matching on `error.message === 'pipelean: operation failed'`**: that message
  now appears only on the fallback path, when the underlying throw value cannot
  carry `.failure`: a primitive (`string`, number, `undefined`, `null`), a frozen
  or otherwise non-extensible error, or an object that rejects the attachment
  (non-writable property, setter-less accessor, Proxy trap).
  Match on the original error instead, or on `error.failure`.
- **Reading `error.cause`**: it is no longer set on the normal path. The
  structured data is on `error.failure`; the thrown value *is* the cause.
- **UI messages and `instanceof` branches**: they now see the real error class
  and message. If you were showing the wrapper's generic text, show
  `error.message` — but note it is the user-facing operation error, so keep your
  own sanitization.
- **Reusing an error object**: attaching `.failure` mutates the original error.
  If the same error instance is reused across results, only the latest
  `.failure` survives.

No change on success: the same result object is still returned, and the two
`TypeError` guards (`awaited result` / `pipelean result`) are unchanged. The
read-**no-failure** rule is unchanged too: `collect` / `skip` results with entries
in `errors` still pass through.

### 2. `mapSeries` / `mapSeriesSync`: remove dead error callbacks

Under the locked `rethrow` a failed item throws before any callback can fire, so
`onError`, `onFailure` and `onSourceError` were accepted and silently ignored.
They are now rejected with a `TypeError` naming the offending key, in both call
forms (the curried form fails at build time):

```text
mapSeries() rethrows on the first error; onError never fires — remove it or use
series/seriesSync with a strategy
```

```diff
-const rows = await mapSeries(items, fn, {
-  onError: ({item, error}) => logger.error({item, error}),
-})
+import {collect, mapSeries, series} from 'pipelean'
+
+// If you only wanted the array, drop the option:
+const rows = await mapSeries(items, fn)
+
+// If you need per-item telemetry, a failure is data: use series.
+const {results, errors} = await series(items, fn, {
+  strategy: collect,
+  onError: ({item, error}) => logger.error({item, error}),
+})
```

`take`, `total`, `onProgress`, `pause`, `pauseOnErrors` and `signal` still pass
through (`mapSeriesSync` rejects the async-only `pause`, `pauseOnErrors` and
`signal` with a `TypeError`, like every sync twin). A conflicting `strategy` is
still rejected
(`'... remove the "collect" strategy'`).

`mapSeriesSync` also reports an async iterable with an explicit `TypeError`
naming its async twin (`'mapSeriesSync() does not support async iterables; use
mapSeries()'`) instead of a generic "not iterable".

### 3. Codemod: `reduceSync(..., {strategy: rethrow}).value` → `foldSync`

The new `no-fold-rethrow` rule (enabled at `warn` in `pipelean/eslint/config`)
flags the value-extraction shape. The rewrite is textual and behavior-identical:

```diff
-import {reduceSync, rethrow} from 'pipelean'
-const byId = reduceSync(rows, (acc, row) => ({...acc, [row.id]: row}), {}, {strategy: rethrow}).value
+import {foldSync} from 'pipelean'
+const byId = foldSync(rows, (acc, row) => ({...acc, [row.id]: row}), {})
```

More readably:

```js
// Before
import {reduceSync, rethrow} from 'pipelean'

const total = reduceSync(
  tracks, (sum, {duration}) => sum + duration, 0, {strategy: rethrow},
).value
```

```js
// After
import {foldSync} from 'pipelean'

const total = foldSync(tracks, (sum, {duration}) => sum + duration, 0)
```

A `recover` in the same options object is **exempt**: there `onError`
legitimately fires before the recovery seam, and `foldSync` would silently drop
recovery. Keep `reduceSync` in that case. The rule is deliberately narrow:
aliased imports and member calls are not detected. Since 0.15.1 the rewrite is
also available as an opt-in editor suggestion on the report.

### 4. `enrichSync` async hooks are not observed

`enrichSync` calls `onStepStart` / `onStepSuccess` fire-and-forget. Its hooks
should be **synchronous**: an async hook's rejection is never observed by the
strategy. A synchronous throw still flows into the strategy like a throwing
operation.

```diff
-enrichSync(steps, {
-  onStepStart: async ({operation}) => {
-    await ui.markRunning(operation)   // rejection is lost
-  },
-})
+enrichSync(steps, {
+  onStepStart: ({operation}) => {
+    ui.markRunning(operation)         // fire-and-forget is fine
+  },
+})
```

If the hook must await, use `enrich` (async), which awaits both hooks.

### Nothing else changes

Strategy defaults, result shapes, the bug-vs-data litmus and the
`undefined`-drops-the-item convention are unchanged. `rethrow` remains
supported and recommended for async I/O; only *extracting a value* from a managed
fold belongs on `foldSync` / `assertOk`. Release narrative:
[NOTES_14_15](releases/NOTES_14_15.md).

## 0.14.0: `foldSync`, `mapSeries`, per-step `enrich` hooks

Everything here is **additive**: no strategy default changes, no result-shape
changes, no rename. Existing calls keep working. Three rewrites are optional, and
only one of them carries a behavior change.

New tools:

- `foldSync(iterable, reducer, initialValue)`: a **raw** sync fold that returns
  the value directly and throws the original error. No options, no report.
- `mapSeries` / `mapSeriesSync`: `series` with the strategy locked to `rethrow`
  and the report unwrapped — a bare array or the original error.
- `enrich` / `enrichSync` accept `onStepStart` and `onStepSuccess` for per-step
  telemetry.

The rule of thumb for the whole release: **is a thrown error a bug or data?**
Bug/impossible → `foldSync` (sync fold), `mapSeries` / `mapSeriesSync`
(sequential map), or `rethrow` (async fold with options). Data →
`reduce` / `scan` / `series` with a strategy. Need the value from a managed
result → `assertOk(result).value`.

### 1. Pure fold: `reduceSync(..., {strategy: rethrow}).value` → `foldSync`

Behavior-identical, a pure textual rewrite.

```js
// Before
import {reduceSync, rethrow} from 'pipelean'

const total = reduceSync(
  tracks, (sum, {duration}) => sum + duration, 0, {strategy: rethrow},
).value
```

```js
// After
import {foldSync} from 'pipelean'

const total = foldSync(tracks, (sum, {duration}) => sum + duration, 0)
```

Use `foldSync` when the fold is **pure and synchronous** and a throw means a bug.
`foldSync` rejects an async iterable with a `TypeError` naming `reduce()`.

### 2. Sequential map: `series(..., {strategy: rethrow}).results` → `mapSeries`

```js
// Before
import {rethrow, series} from 'pipelean'

const rows = (await series(items, fn, {strategy: rethrow})).results
```

```js
// After
import {mapSeries} from 'pipelean'

const rows = await mapSeries(items, fn)
```

`mapSeries` keeps every other option (`take`, `total`, `onProgress`, `pause`,
`pauseOnErrors`, `signal`), accepts the curried form, and rejects any
non-`rethrow` strategy with a `TypeError`. The sync twin is `mapSeriesSync`.

### 3. Per-step UI status: hand-rolled fold → `enrich` + hooks

```js
// Before: manual index, merge, validation and try/catch
const state = {...input}
for (let index = 0; index < ops.length; index++) {
  ui.start(ops[index].name, index, ops.length)
  try {
    Object.assign(state, await ops[index](state))
    ui.success(ops[index].name, index)
  } catch (error) {
    ui.error(ops[index].name, error)
  }
}
```

```js
// After
import {enrich} from 'pipelean'

const process = enrich(ops, {
  onStepStart: ({operation, index, total}) => ui.start(operation, index, total),
  onStepSuccess: ({operation, patch, index}) => ui.success(operation, patch, index),
  onError: ({operation, error}) => ui.error(operation, error),
})
const {value, errors, failure} = await process(input)
```

`onStepSuccess` fires only after the patch is validated and merged. Errors stay
on `onError` (there is no `onStepError`). A throwing hook flows into the strategy;
`failFast` stops later hooks. `enrich` awaits hooks, `enrichSync` does not.

### Optional codemod with a behavior delta

If you also rewrite folds that relied on the default `failFast` and read
`.value`:

```diff
-const total = reduceSync(tracks, addDuration, 0).value
+const total = foldSync(tracks, addDuration, 0)
```

**Warning**: this changes behavior. Under the old form a `failFast` failure was
ignored — the run stopped, `.value` kept the last accumulator, nothing threw.
`foldSync` throws. Apply it only where the reducer cannot fail; otherwise keep
`reduceSync` and inspect `failure` (or wrap with `assertOk`).

### Lint advice changed

`no-array-reduce` still flags every `.reduce()`, but its advice is now
`foldSync(items, reducer, initial)` for a pure sync fold, or `reduce` when you
need the report. It no longer suggests `scan`, which keeps every intermediate and
was the wrong replacement.

### Nothing else changes

Strategy defaults, result shapes and `undefined`-drops-the-item are unchanged.
`rethrow` remains supported and recommended for async I/O; only *extracting a
value* from a managed fold moved to `foldSync` / `assertOk`.

## 0.13.0: signals, pause policy, fold `recover`, `assertOk`

Everything here is **additive**: no strategy default changes, no result-shape
changes, no rename. You can keep existing code as it is.

New tools:

- `signal` on `series`, `filter`, `scan` and `reduce`: lifecycle cancellation
  checked between items and during a pending `pause`, keeping completed work.
- `pause` (and `pauseOnErrors`) on `scan` / `reduce`, not just `series`: the
  loop cadence now lives in the consumer, abort-aware.
- `recover` on the folds: a fold-local seam that turns a scanner error into the
  next accumulator.
- `assertOk(result)`: throw when a result's `failure` is truthy, for callers
  that would otherwise ignore a `failFast` stop.

### Two behavior changes to call out

1. **Sync twins now throw for async-only options.** `seriesSync`, `filterSync`,
   `findSync`, `scanSync` and `reduceSync` used to ignore `signal`, `pause` and
   `pauseOnErrors` silently. They now throw a `TypeError`: a sync run cannot wait
   on a timer and cannot react to an async abort, so accepting the option was a
   lie. Remove the option, or move that run to the async twin.
2. **Invalid `pause` / `signal` types now throw.** `pause` must be a finite
   number or a function; `signal` must be an `AbortSignal`. A string, `NaN`,
   `Infinity`, a plain object or a number passed as `signal` throws a `TypeError`
   before iteration starts instead of being ignored.

### Service loop: before / after

Before, lifecycle cancellation and the cadence were assembled by hand: a
predicate over the abort flag, a hand-rolled interruptible sleep, and a
`try/catch` inside the round to keep the loop alive.

```js
// Before
const {value} = await reduce(
  stopWhen(forever(), () => signal.aborted),
  async state => {
    try {
      await runRound(state)
      return {...state, failures: 0}
    } catch (error) {
      log.warn(error.message)
      await interruptibleSleep(everyMs, signal)   // hand-rolled
      return {...state, failures: state.failures + 1}
    }
  },
  {failures: 0},
  {strategy: rethrow},
)
```

After, each concern has one home: `signal` is the lifecycle stop, `pause` is the
abort-aware cadence, and `recover` turns a failed round into the next
accumulator.

```js
// After
const {value} = await reduce(
  forever(),
  async state => {
    await runRound(state)                         // may throw
    return {...state, failures: 0}
  },
  {failures: 0},
  {
    signal,                                       // lifecycle stop
    strategy: rethrow,                            // fatal errors still exit
    onError: ({error}) => log.warn(error.message),
    recover: ({state}) => ({...state, failures: state.failures + 1}),
    pause: state => backoff({failures: state.failures}),
  },
)
```

`recover` is fold-only and receives the accumulator *before* the failed round.
`onError` still fires even under `rethrow`; the recovered error is consumed. The
outer `try/finally` for external resources remains the caller's business.

### Tests: injected timers → fake timers

Loop tests used to inject a fake timer/sleep into the scanner because the delay
lived there. With `pause` owned by the consumer, use Vitest's fake timers
instead: `vi.useFakeTimers()`, advance with
`await vi.advanceTimersByTimeAsync(ms)`, and `vi.useRealTimers()` in
`afterEach`. Aborts during a pause resolve immediately, so no injected clock is
needed.

### `assertOk` for ignored outcomes

`failFast` reports failure as data; a caller that never inspects the result can
stop silently. Wrap the result:

```js
import {assertOk, series} from 'pipelean'

const result = assertOk(await series(items, fn, {strategy: 'failFast'}))
```

No failure returns the same object. A truthy `failure` throws
`Error('pipelean: operation failed')` with `cause` set to the underlying error
(the first error for a `failLate` aggregate) and `failure` set to the structured
failure. It checks `failure`, not `errors`, so `collect` / `skip` results pass
through: this is a guard, not a new strategy.

## 0.12.0: `flow` → `enrich`, stricter composition

Four breaking changes. They exist to remove the "is the stateful one `flow`, `scan` or `reduce`?" ambiguity.

**`flow()` / `flowSync()` are now `enrich()` / `enrichSync()`.** Hard rename, no alias. The mental model:

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

`enrich` is literally `reduce` over your steps:

```js
// Before
import { flow } from 'pipelean'
const process = flow([prepare, parse, finalize])

// After
import { enrich } from 'pipelean'
const process = enrich([prepare, parse, finalize])

// Identical to:
const process = input => reduce(
  [prepare, parse, finalize],
  (state, op) => ({...state, ...op(state)}),
  input,
)
```

`foldSteps` is used in the documentation as the explanatory spelling of `enrich`; it is **not** an export.

**`tryCatch()` / `tryCatchSync()` now return `undefined` on failure instead of `null`.** `undefined` is the library-wide drop signal, so a failed step now short-circuits `pipe` and drops the item in `series`. If you relied on `null`:

```js
// Before
const data = await safeFetch(url) // null on error
if (data === null) return fallback

// After: undefined on error
const data = (await safeFetch(url)) ?? fallback
```

**`scanReduce()` / `scanReduceSync()` are removed.** Use `reduce()` / `reduceSync()`.

**`storePartialResults` is no longer a public option.** `scan` always keeps every intermediate result; `reduce` always keeps the final value.

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

`scanReduce` was renamed to `reduce` as the main API. `scanReduce` and `scanReduceSync` were kept as aliases pointing to the same functions. They were removed in 0.12.0.

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
