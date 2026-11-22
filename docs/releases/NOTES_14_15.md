# Release Notes v0.14 → v0.15

## The gap this release closes

Two inputs shaped 0.15:

- **Consumer code kept hand-rolling the guard.** The shape
  `if (failure) throw failure.error` was written by hand, and it is wrong for a
  `failLate` aggregate (`failure` is `{errors}`, so it throws `undefined`). The
  documented fix was `assertOk`, but its wrapper error made the guard a poor
  substitute: catching code that matched on the original error's message or
  class stopped working when the outcome went through `assertOk`.
- **An external adversarial review of 0.14** found the loose edges around the
  new shapes: `mapSeries` accepted error callbacks that could never fire,
  `enrichSync` documentation did not say that async hooks are unobserved, a
  `null` strategy produced the wrong error, and the reference contradicted
  itself about `mapSeries` options.

0.15 makes `assertOk` throw what the hand-roll meant to throw, and makes the new
surface fail loudly instead of accepting dead configuration. It is a **0.x minor
with behavior changes**: the migration section at the top of
[docs/migration.md](../migration.md#0150-assertok-throws-the-original-error)
lists every one.

## Changed: `assertOk` throws the original error

`assertOk(result)` still returns the same result when `failure` is falsy and
still rejects an un-awaited Promise or a non-result value with the same two
`TypeError`s. When `failure` is truthy, it now throws the **original underlying
error**:

- `failure.error` for a normal failure, `failure.errors[0].error` for a
  `failLate` aggregate;
- the structured failure is attached as `error.failure`;
- identity, message, stack and class (`instanceof`) survive — there is no
  wrapper.

```js
import {assertOk, series} from 'pipelean'

try {
  assertOk(await series(jobs, importJob, {strategy: 'failFast'}))
} catch (error) {
  error.failure                    // {item, error, index} (or {errors})
  error instanceof TypeError       // true, when the mapper threw one
}
```

**Attaching `.failure` mutates the original error.** An error object reused
across results keeps only the latest `.failure`.

**Fallback for values that cannot carry a property.** A primitive throw value
(`string`, number, `undefined`, `null`) or a frozen / non-extensible error object
cannot take `.failure`. For those, `assertOk` throws
`Error('pipelean: operation failed', {cause: underlying})` with `.failure`
attached.

Before and after, for the same result:

```diff
 try {
   assertOk(await series(jobs, importJob, {strategy: 'failFast'}))
 } catch (error) {
-  error.message                     // 'pipelean: operation failed'
-  error.cause                       // the original mapper error
-  error instanceof TypeError        // false — it is a wrapper
+  error                             // the original mapper error
+  error.failure                     // the structured failure
+  error instanceof TypeError        // true
 }
```

This also makes the docs honest: the hand-roll `if (failure) throw
failure.error` is now exactly what `assertOk` does, plus the aggregate handling
and the `.failure` attachment. The `.value`-destructuring trap is unchanged —
`assertOk` asserts **no failure**, not "no errors", so `collect` / `skip` results
pass through.

## New lint rule: `no-fold-rethrow`

`reduceSync(items, reducer, initial, {strategy: rethrow}).value` is a managed
fold used as a value extractor. The new rule flags it and points at
`foldSync(items, reducer, initial)`, which returns the value directly. It is
enabled at `warn` in `pipelean/eslint/config`.

- It flags both the `rethrow` identifier and the `'throw'` string literal.
- A `recover` in the same options object **exempts** the call: that is a managed
  use where `onError` legitimately fires before the recovery seam, and migrating
  to `foldSync` would silently drop recovery.
- It is deliberately narrow: async folds are never flagged, and aliased imports
  (`import {reduceSync as rs}`) or member calls evade it by design. Resolving
  bindings reliably would drag in re-exports, computed keys and spread options.

## Changed: `mapSeries` / `mapSeriesSync` reject dead callbacks

Under the locked `rethrow`, a failed item throws before any callback runs. In
0.14 `onError`, `onFailure` and `onSourceError` were accepted and then silently
ignored — dead configuration. They are now rejected with a `TypeError` that
names the offending key, in both call forms (the curried form fails at build
time):

```text
mapSeries() rethrows on the first error; onError never fires — remove it or use
series/seriesSync with a strategy
```

Everything else still passes through: `take`, `total`, `onProgress`, `pause`,
`pauseOnErrors`, `signal` (`mapSeriesSync` rejects the async-only `pause`,
`pauseOnErrors` and `signal` with a `TypeError`, like every sync twin). A
conflicting `strategy` is still rejected
(`'... remove the "collect" strategy'`). Use `series` with a collecting strategy
when you need per-item telemetry.

`mapSeriesSync` also gained an explicit up-front `TypeError` for an async
iterable — `'mapSeriesSync() does not support async iterables; use
mapSeries()'` — instead of a generic "not iterable".

## Documented: `enrichSync` hooks are fire-and-forget

`enrich` awaits `onStepStart` / `onStepSuccess`. `enrichSync` does not, matching
its other sync callbacks. The consequence is now stated in the contract: use
**synchronous hooks** in `enrichSync`. An async hook's rejection is never
observed by the strategy; a synchronous throw still is, and still flows into the
strategy like a throwing operation.

There is no validation that rejects an async hook. That would be a new
library-wide policy for sync callbacks, not a 0.15 change.

## Corrections and polish

No contract changes; these make existing behavior match its documentation.

- **`mapSeries` options contradiction resolved.** The reference said every other
  option "passes through untouched" and also that the error callbacks are
  "dead". Both are true only after the 0.15 rejection: options pass through
  **except** the three error callbacks, which are rejected.
- **`null` as a strategy is a clean configuration `TypeError`.** The strategy
  name is read null-safely, so `{strategy: null}` reports the intended
  `'...remove the "null" strategy'` instead of crashing on a property read.
- **`enrich` step names are computed once at build time.** Error messages and
  both hooks see the same normalization (`fn.name || operation-${index}`) without
  recomputing it per step.
- **Timing-test margins widened.** One series timing assertion had a flaky upper
  bound; it is now 60 ms, still pinning that pacing happens without depending on
  a loaded CI machine.
- **`tryCatch` throwing-`onSuccess` routing pinned.** This was pre-existing
  behavior with no test: a throw from `onSuccess` is caught by the same wrapper,
  routed to `onError`, and the wrapper returns `undefined` (the drop signal).
  `onFinally` still runs. It is now pinned.
- **Example accumulator renamed.** The `foldSync` index example used `index` as
  its accumulator, which read like the third parameter. It is now `acc`.

## What we deliberately did not add

- **No async-hook validation in `enrichSync`.** Rejecting a thenable returned by
  a sync hook is a library-wide sync-callback policy (the other sync callbacks
  have the same shape), not a one-function fix. Parked until it can be decided
  once.
- **No dead-callback rejection on `series` itself.** `onError` next to
  `strategy: rethrow` is also dead, but `series` is the general-purpose
  combinator and the option combinations are wider (including `recover` on
  folds). The 0.15 validation is scoped to the locked-strategy wrappers, where
  the policy is fixed and the check is exact.
- **No `prefer-assert-ok` rule.** The hand-roll is better served by docs and by
  making `assertOk` throw the original error; an AST rule for "read `failure`
  and throw its `.error`" is more surface than value for now.

## Unchanged on purpose

- **Strategy defaults**: `collect` for `series` / `filter` / `enrich` / `join`;
  `failFast` for `scan` / `reduce`. `foldSync` has no strategy at all.
- **Result shapes**: `{results, errors, sourceErrors, failure}` for
  `series` / `filter` / `scan`; `{value, errors, sourceErrors, failure}` for
  `reduce`; `{value, errors, failure}` for `enrich` / `join`; a bare array for
  `mapSeries` / `mapSeriesSync`; a bare value for `foldSync`.
- **`rethrow` remains supported and recommended for async I/O**: a service loop,
  a daemon, a command boundary where a failure must exit. Only *value extraction*
  from a managed fold belongs on `foldSync` / `assertOk`.
- **The bug-vs-data litmus**: bug/impossible → `foldSync`, `mapSeries` /
  `mapSeriesSync`, or `rethrow`; data → a managed strategy. It is unchanged, and
  the 0.15 changes make the guard side of it sharper.
- **`undefined` as the drop signal** in `series`, `filter`, `pipe`,
  `mapSeries` and `mapSeriesSync`; `enrich` still requires `{}` for a no-op
  patch.
