# Release Notes v0.13 → v0.14

## The gap this release closes

A consumer review found the same three shapes written by hand, over and over:

- **Pure folds committed to the managed engine.** A sum, a count or an index was
  written as `reduceSync(items, reducer, initial, {strategy: rethrow}).value` —
  three concepts and a `.value` unwrap to say "fold these numbers". The
  alternatives were worse: `.reduce()` (flagged, and unreadable) or destructuring
  `{value}` and silently ignoring the failure.
- **Sequential maps committed to the report.** `series(items, fn, {strategy:
  rethrow}).results` was the only way to say "map these one at a time, throw on
  the first failure". The `.results` unwrap and the `rethrow` incantation were
  noise around a very common intent.
- **Hand-rolled enrichment for UI status.** A per-step status ("running
  `extractYear`, 2 of 4") meant a manual fold with its own index, merge,
  validation and `try/catch` — a second, untested copy of `enrich`.

0.14 names the first two shapes and removes the need for the third. It is
**additive**: no strategy default changes, no result-shape changes, no rename.
Every existing call keeps working.

## New: `foldSync` — the raw sync fold

`foldSync(iterable, reducer, initialValue)` returns the last accumulator
directly. It is **raw**: no options, no strategy, no report, no callbacks.

```js
import {foldSync} from 'pipelean'

const total = foldSync(tracks, (sum, {duration}) => sum + duration, 0)
```

- **Behavior-identical** to `reduceSync(items, reducer, initial, {strategy:
  rethrow}).value` for a pure fold.
- **Throws the original error**, unchanged, from either the reducer or the
  iterable. Nothing wraps it; no strategy is consulted.
- **`undefined` is a legal accumulator.** Folds never drop, and `foldSync`
  preserves that.
- **Sync only**, like `findSync`. An async iterable is a `TypeError` naming
  `reduce()`; an async reducer is not awaited, so it produces a Promise
  accumulator.
- **Three arguments exactly.** A fourth argument — a stray `{strategy:
  rethrow}` — is a `TypeError`, so the migration fails loudly instead of being
  silently ignored.
- **Validated**: non-function reducer, non-iterable, async iterable and a fourth
  argument each throw a clear `TypeError` before iteration.

There is deliberately **no async `fold`**: async folds need `recover`, `signal`
and `pause`, so their home is `reduce`.

## New: `mapSeries` / `mapSeriesSync` — sequential map, locked `rethrow`

`mapSeries(items, fn, opts?)` is `series` with the strategy fixed to `rethrow`
and the report unwrapped: it resolves to a bare array, or rejects with the
original error.

```js
import {mapSeries} from 'pipelean'

const parsed = await mapSeries(files, file => parseFile(file))
```

- **Both call forms**, like `series`: `mapSeries(items, fn, opts?)` and the
  curried `mapSeries(fn, opts?)`.
- **Options pass through** (`take`, `total`, `onProgress`, `pause`,
  `pauseOnErrors`, `signal`), so it is still a sequential map with progress and
  pacing.
- **Strategy lock is validated.** Passing any strategy other than `rethrow` /
  `'throw'` is a `TypeError`, never a silent override.
- **`undefined` drops the item.** This is not `Array.prototype.map`: the output
  can be shorter than the input.
- **The rethrow is silent.** A failed item throws before any callback, so
  `onError` and `onFailure` never fire — parity with `series(..., {strategy:
  rethrow})`. Use `series` with a collecting strategy when you need per-item
  telemetry.

`mapSeriesSync` is the sync twin: sync iterables only, returns the array
directly.

## New: `enrich` / `enrichSync` per-step hooks

Two optional hooks make a stateful enrichment observable without hand-rolling
it:

- `onStepStart({operation, index, total})` — **before** `operation(state)`.
- `onStepSuccess({operation, patch, index, total})` — **after** the patch is
  validated and merged. `patch` is the object the operation returned, pre-merge.

```js
const processAlbum = enrich([prepare, extractYear, extractArtists], {
  onStepStart: ({operation, index, total}) => ui.start(operation, index, total),
  onStepSuccess: ({operation, patch}) => ui.done(operation, patch),
  onError: ({operation, error}) => ui.fail(operation, error),
})
```

- **Errors stay on `onError`.** There is deliberately no `onStepError`: one
  error channel, normalized as before.
- **A throwing hook flows into the strategy** like a throwing operation.
  `failFast` stops (later hooks never fire), `collect` / `failLate` record and
  continue, `skip` drops, `rethrow` throws. A throwing `onStepSuccess` fails the
  step, so its patch is not committed.
- **`enrich` awaits hooks**; `enrichSync` calls them fire-and-forget, consistent
  with its other callbacks.
- **Options bind at build time**, and the hooks fire on every run of the
  returned pipeline.
- **`recover` stays rejected**, as before.

## Documented: `tryCatch` throwing-`onError`

This was already the behavior; it is now pinned by tests and documented. A
throwing (or rejecting) `onError` **propagates**: it replaces the original error
as the rejection, and `onFinally` still runs.

```js
const wrapped = tryCatch(fn, {
  onError: error => {
    throw Object.assign(error, {operation: 'charge'})
  },
  onFinally: () => metrics.timing('charge', startedAt),
})
```

The rethrown value keeps the original error's **identity**, so callers matching
on it keep working. A plain `onError` still swallows and returns `undefined`.

## Corrections

- **`no-array-reduce` advice.** The rule flagged `.reduce()` but pointed at
  `scan`, which keeps every intermediate and is the wrong replacement. It now
  advises `foldSync(items, reducer, initial)` for a pure sync fold, or `reduce`
  when the report is needed. The rule still flags every `.reduce`.
- **A misnamed test.** `tests/reduce-sync.test.js` described a `failFast` fold as
  preserving the "value" while its name suggested otherwise; the test now says
  what it pins: `failFast` stops on the first error and **preserves the last
  accumulator** (only `results` is cleared).

## Migration: two textual codemods

**Recommended (behavior-identical).** A pure fold written with an explicit
`rethrow`:

```diff
-import {reduceSync, rethrow} from 'pipelean'
-const total = reduceSync(tracks, addDuration, 0, {strategy: rethrow}).value
+import {foldSync} from 'pipelean'
+const total = foldSync(tracks, addDuration, 0)
```

**Optional (behavior delta).** A fold that leaned on the default `failFast` and
read `.value`:

```diff
-const total = reduceSync(tracks, addDuration, 0).value
+const total = foldSync(tracks, addDuration, 0)
```

This is a **behavior change**: under the old form a `failFast` failure was
*ignored* (the run stopped, `.value` held the last accumulator, no throw). With
`foldSync` the failure now throws. Apply it only where the fold genuinely cannot
fail; otherwise keep `reduceSync` and read `failure` (or guard with
`assertOk`). Both codemods are suitable for `reduce` → `foldSync` only when the
data is synchronous: `foldSync` is sync-only.

The same rewrite in the map shape:

```diff
-const rows = (await series(items, fn, {strategy: rethrow})).results
+const rows = await mapSeries(items, fn)
```

## What we deliberately did not add

- **No async `fold`.** Async folds need `recover`, `signal` and `pause`; a raw
  async fold would either drop them or re-invent the engine.
- **No `logged(fn, report)` combinator.** It is a `tryCatch` one-liner, and a
  reporter factory is userland code.
- **No `outcome.orThrow()` / `.unwrap()` methods.** Results stay plain data:
  serializable, spreadable, inspectable. `assertOk(result)` is the guard.
- **No `onStepError`.** `onError` already owns step errors, with the same
  normalized `{operation, error, index, total}` shape.
- **No `allowWhenNoErrorStrategy` option.** "This cannot throw" is not decidable
  statically, and a flag that promises it would be a lie.
- **No new `no-fold-rethrow` lint rule yet.** Advice lands in the docs first;
  the rule is future work.

## Unchanged on purpose

- **Strategy defaults**: `collect` for `series` / `filter` / `enrich` / `join`;
  `failFast` for `scan` / `reduce`. `foldSync` has no strategy at all.
- **Result shapes**: `{results, errors, sourceErrors, failure}` for
  `series` / `filter` / `scan` / `mapSeries`'s underlying run;
  `{value, errors, sourceErrors, failure}` for `reduce`;
  `{value, errors, failure}` for `enrich` / `join`. `mapSeries` returns a bare
  array and `foldSync` a bare value — both by design.
- **`rethrow` is supported and recommended for async I/O**: a service loop, a
  daemon, a command boundary where a failure must exit. Only *value extraction*
  from a managed fold moved to `foldSync` / `assertOk`.
- **`undefined` as the drop signal** in `series`, `filter`, `pipe`,
  `mapSeries` and `mapSeriesSync`; `enrich` still requires `{}` for a no-op
  patch.
