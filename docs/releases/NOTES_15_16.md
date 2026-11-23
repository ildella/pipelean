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
lifecycle callbacks. The four telemetry callbacks are covered too — see
[Telemetry callbacks are guarded too](#changed-telemetry-callbacks-are-guarded-too).

The violation is **fatal**: it escapes the active strategy and is never
collected as data, even under `collect`. This matches the async-iterable guard,
which is a configuration error, not an item failure. A synchronous throw from a
callback is unchanged — it still flows into the strategy.

The violation is fatal **across the seam** too. The rethrow seams
(`itemErrorContext`, `settleFoldError`) are shared by the sync and async
engines, so a sync-callback `TypeError` raised inside an async combinator's
callback — for example an async `series` mapper calling `foldSync` with an
async reducer — never lands in `errors`, and an async fold's `recover` is
bypassed too: the run aborts on the source-error path, `sourceErrors` under
`collect` / `failLate`, `failure` under `failFast`, nothing recorded under
`skip`, or thrown by `rethrow`. A plain `Error` thrown by the same nested
combinator is still collected as data. This matches the async-iterable guard: a
configuration error is fatal on both sides of the seam.

`isThenable` is now defined once in `shared.js` and shared by `assertOk`, the
sync `recover` guard and the new callback guard.

## Changed: `enrichSync` hooks are rejected, not fire-and-forget

0.15 documented `enrichSync` hooks as fire-and-forget: an async hook's rejection
was never observed. That documentation is replaced by the rejection. An async
`onStepStart` / `onStepSuccess` now throws a `TypeError` pointing at `enrich`,
like an async operation. The two tests that pinned the old fire-and-forget
behavior now pin the rejection.

## Changed: `tryCatch` awaits every lifecycle hook

`tryCatch` already awaited `onSuccess` and `onError`, but called `onStart()` and
`onFinally()` without waiting. An async hook's promise was dropped: a telemetry
flush started in `onFinally` could outlive the wrapper, and its rejection was an
unhandled rejection. Both hooks are now awaited, so the 0.16 advice
(`tryCatchSync` → `tryCatch` when the callbacks are async) holds for all four
hooks: when the wrapper settles, every hook has completed.

Error precedence follows from where the hook runs:

- A rejecting `onStart` runs inside the `try`, so it is handled like a failing
  `fn`: `onError` fires and the wrapper returns `undefined` (the drop signal).
  `fn` never runs.
- A rejecting `onFinally` runs in the `finally`, so it **rejects the wrapper**
  and overrides whatever the `try` body was about to return — or the error
  `onError` was rethrowing. That replaces the old unhandled rejection.
- `onFinally` still runs on both the success and the failure path.

## Changed: telemetry callbacks are guarded too

The policy has no carve-out. `onError`, `onFailure`, `onSourceError` and
`onProgress` on the sync combinators now reject a returned Promise with the same
fatal `TypeError`, naming the async twin —
`'seriesSync() onError returned a Promise; use series()'`. It is never collected
as data, even under `collect`; the message names the api that started the run
(`filterSync` says `filter`, `enrichSync` says `enrich`; `findSync` has no async
twin and points at `filter`).

This closes the last silent hole: a `fire-and-forget` async `onProgress` used to
leave its rejection unobserved, and an async `onError` under `collect` looked
like a telemetry call that simply did nothing. Async combinators are unchanged:
they still await `onError` / `onProgress` and dispatch `onFailure` /
`onSourceError` as before, so an async callback stays valid there.

## What we deliberately did not add

- **No new API.** The fix is a guard on the existing sync surface, not a new
  combinator. `foldSync` still has no async twin; `findSync` is still sync-only.

## Unchanged on purpose

- **Synchronous throws** still flow into the strategy: `collect` records them,
  `failFast` stops, `rethrow` throws the original error.
- **`undefined` as the drop signal** in `seriesSync` / `filterSync` /
  `mapSeriesSync` / `pipeSync`; `enrich` still requires `{}` for a no-op.
- **Strategy defaults, result shapes, and the async combinators** are untouched.
- **The bug-vs-data litmus** is unchanged; the sync side of it is now enforced
  at the callback boundary instead of documented around it.