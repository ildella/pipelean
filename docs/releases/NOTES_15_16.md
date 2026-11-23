# Release Notes v0.15 → v0.16

## The gap this release closes

0.15 parked one decision explicitly: rejecting a thenable returned by a sync
callback was "a library-wide sync-callback policy, not a one-function fix", to
be decided once. 0.16 decides it.

The trigger was a class of silent misuse. A sync combinator handed an async
callback did not fail — it corrupted the run quietly:

- `mapSeriesSync(items, async x => …)` returned an array of Promises.
- `filterSync` / `findSync` with an async predicate saw a truthy Promise and
  kept every item / returned the first.
- `enrichSync` with an async operation spread a Promise as an empty patch: a
  silent no-op that dropped the step's data.
- `tryCatchSync(async fn)` let the rejection escape without ever calling
  `onError`.

The library already rejected async iterables, async-only options and a thenable
`recover`. The callback boundary was the remaining hole.

## Changed: sync callbacks must be synchronous

A sync combinator now rejects a callback that returns a Promise (or any
thenable) with a `TypeError` naming the async twin —
`'seriesSync() mapper returned a Promise; use series()'`. Covered callbacks: the
`seriesSync` / `mapSeriesSync` mapper, the `filterSync` / `findSync` predicate,
the `scanSync` / `reduceSync` scanner, the `foldSync` reducer, the `enrichSync`
operation and per-step hooks, the `pipeSync` step, and `tryCatchSync`'s `fn` and
lifecycle callbacks.

The violation is **fatal**: it escapes the active strategy and is never
collected as data, even under `collect`. This matches the async-iterable guard,
which is a configuration error, not an item failure. A synchronous throw from a
callback is unchanged — it still flows into the strategy.

`isThenable` is now defined once in `shared.js` and shared by `assertOk`, the
sync `recover` guard and the new callback guard.

## Changed: `enrichSync` hooks are rejected, not fire-and-forget

0.15 documented `enrichSync` hooks as fire-and-forget: an async hook's rejection
was never observed. That documentation is replaced by the rejection. An async
`onStepStart` / `onStepSuccess` now throws a `TypeError` pointing at `enrich`,
like an async operation. The two tests that pinned the old fire-and-forget
behavior now pin the rejection.

## What we deliberately did not add

- **No new API.** The fix is a guard on the existing sync surface, not a new
  combinator. `foldSync` still has no async twin; `findSync` is still sync-only.
- **No change to the error/progress callbacks.** `onError`, `onFailure`,
  `onSourceError` and `onProgress` on the sync combinators keep their existing
  fire-and-forget dispatch; the policy covers the value-producing callbacks and
  the `enrichSync` hooks.

## Unchanged on purpose

- **Synchronous throws** still flow into the strategy: `collect` records them,
  `failFast` stops, `rethrow` throws the original error.
- **`undefined` as the drop signal** in `seriesSync` / `filterSync` /
  `mapSeriesSync` / `pipeSync`; `enrich` still requires `{}` for a no-op.
- **Strategy defaults, result shapes, and the async combinators** are untouched.
- **The bug-vs-data litmus** is unchanged; the sync side of it is now enforced
  at the callback boundary instead of documented around it.