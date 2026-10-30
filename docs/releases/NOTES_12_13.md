# Release Notes v0.12 → v0.13

## The gap this release closes

A service loop — poller, worker tick, board sync — is the one shape the library
did not make explicit. Users assembled it from `forever()` plus a
`stopWhen(forever(), () => signal.aborted)` predicate, a hand-rolled
interruptible sleep, and a `try/catch` inside the round. Each of those pieces
was correct on its own, but none of them was the library's job:

- cancellation was expressed as a **source predicate**, even though it is a
  lifecycle event;
- the loop cadence lived **inside the scanner**, so it could not be abort-aware
  without custom code;
- surviving a failed round meant a **manual `try/catch`** that duplicated the
  failure accounting.

0.13 gives each concern one home: `signal` for lifecycle cancellation, `pause`
for cadence, `recover` for a failed fold step, `assertOk` for an ignored
outcome. It adds no loop primitive: the loop is still `reduce` over
`forever()`.

## New: `signal`

`series`, `filter`, `scan` and `reduce` accept `signal: AbortSignal`.

- Checked **before** each item and while a `pause` is pending.
- Aborting is a **clean completion**, not an error: `failure: false`, no
  `sourceErrors`, completed results/accumulator preserved.
- It never interrupts an in-flight mapper/scanner or a pending `source.next()`:
  the step finishes, its result is kept, then the run stops before the pause.
- Composes with `stopWhen` and `take`; they remain independent stop conditions.

`stopWhen` stays the **source-level** stop (batch limit, content sentinel), works
with raw `for await`, and needs no consumer options. `signal` owns lifecycle
cancellation. They compose freely.

## New: `pause` as a policy

`pause` is no longer `series`-only. `scan` and `reduce` accept it; their sync
twins reject it (see **Stricter validation**).

- `series` / `filter`: `pause` may be a number or `(item, index) => ms`.
- folds: a number or `(accumulator, item, index) => ms`, resolved **after** the
  accumulator update, so it sees the new state.
- A non-positive / `undefined` / `NaN` result means no wait. A positive finite
  number waits, abort-aware.
- `pauseOnErrors` also pauses after a handled error (including `skip`).
- A **throwing** `pause` is a source/config error, not an item error: it is not
  recoverable.

## New: fold `recover`

`scan` / `reduce` accept a fold-local seam between the scanner error and the
strategy.

```js
recover: ({error, item, index, state, total?}) => nextAccumulator
```

- **Fold-only.** It exists where there is an accumulator to recover into:
  `scan`, `reduce`, `scanSync`, `reduceSync`. `series`, `filter`, `findSync`,
  `enrich`, `join` and `pipe` throw a `TypeError`.
- **Returns the next accumulator**, not a patch — the value is used exactly as
  if the scanner had returned it. `state` is the accumulator passed *into* the
  failed scanner call.
- **The recovered error is consumed**: no `errors` entry, `failure` stays
  `false`, `onFailure` is not called, and `scan` pushes the recovered
  accumulator into `results`.
- **`onError` fires first, even under `rethrow`.** With recovery the error is
  handled, so `rethrow` must not suppress telemetry. Without `recover`,
  `rethrow` stays silent as before.
- **A throwing `recover` delegates to the strategy**: `failFast` stops,
  `collect` / `failLate` record it, `skip` ignores it, `rethrow` rejects. The
  original scanner error was already reported, so two `onError` reports can be
  observed for one item.
- **Source errors bypass it.** A dead generator is still `onSourceError` /
  `sourceErrors` / `rethrow`.
- **`pause` runs after a successful recovery** regardless of `pauseOnErrors`,
  because a recovered item is a successful iteration. An abort during recovery
  keeps the recovered accumulator, skips the pause and stops.
- **Bounded memory over `forever()`**: like any fold, it keeps one accumulator
  (and, for `scan`, the intermediates) — not one entry per loop round.
- **Sync folds** require `recover` to be synchronous; returning a thenable is a
  `TypeError` handled by the active strategy.
- **Not a lifecycle hook.** The outer `try/finally` for external resources
  (sockets, file handles) remains the caller's business.

## New: `assertOk`

`failFast` does not throw: it stops the run and returns `failure` as data. If the
caller ignores the result, a critical job can stop silently. `assertOk(result)`
guards that:

- falsy `failure`: returns the **same** result object;
- truthy `failure`: throws `Error('pipelean: operation failed')` with `cause`
  set to the underlying error (`failure.error`, or the first
  `failure.errors[].error` for a `failLate` aggregate) and `failure` set to the
  structured failure object;
- it expects an **awaited** Pipelean result: a thenable throws
  `TypeError('assertOk() expects an awaited result, not a Promise')` and a
  non-result (`undefined`, `null`, a plain object without `failure`) throws
  `TypeError('assertOk() expects a pipelean result')`.

It asserts **no failure**, not "no errors": under `collect` / `skip`, `failure`
is `false` even when `errors` is non-empty, so the result passes through. It is
a guard against ignored outcomes, not a way to turn `collect` into `rethrow`.

## Stricter validation

Two previously silent mistakes now fail immediately:

1. **Sync twins reject async-only options.** `seriesSync`, `filterSync`,
   `findSync`, `scanSync` and `reduceSync` throw a `TypeError` for `signal`,
   `pause` or `pauseOnErrors` instead of silently ignoring them.
2. **Invalid option types throw.** `pause` must be a finite number or a
   function; `signal` must be an `AbortSignal`. A string, `NaN`, `Infinity`, a
   plain object used as `signal`, and similar values throw a `TypeError` before
   iteration starts.

## The service-loop recipe before/after

Before:

```js
const {value} = await reduce(
  stopWhen(forever(), () => signal.aborted),
  async state => {
    try {
      await runRound(state)
      return {...state, failures: 0}
    } catch (error) {
      log.warn(error.message)
      await interruptibleSleep(everyMs, signal)
      return {...state, failures: state.failures + 1}
    }
  },
  {failures: 0},
  {strategy: rethrow},
)
```

After:

```js
const {value} = await reduce(
  forever(),
  async state => {
    await runRound(state)
    return {...state, failures: 0}
  },
  {failures: 0},
  {
    signal,
    strategy: rethrow,
    onError: ({error}) => log.warn(error.message),
    recover: ({state}) => ({...state, failures: state.failures + 1}),
    pause: state => backoff({failures: state.failures}),
  },
)
```

Cancellation is the signal, cadence is `pause`, recovery is `recover`. The round
no longer contains a `try/catch`.

## What we deliberately did not add

- **No `loop()` primitive.** A daemon is `reduce(forever(), ...)`; adding a
  second way to write the same loop would split the model.
- **No `recover` outside the folds.** `series`, `filter`, `findSync`, `enrich`,
  `join` and `pipe` have no accumulator to recover into; `scan` / `reduce` are
  the only folds with that seam.
- **No intra-item cancellation.** `signal` stops between items and during
  `pause`; it never aborts an in-flight operation. Pass an `AbortSignal` to
  `fetch` and friends yourself.
- **No lifecycle hooks.** `tryCatch` covers single-function hooks; there are no
  before/after-run hooks and no automatic resource cleanup.

## Unchanged on purpose

- **Strategy defaults**: `collect` for `series` / `filter` / `enrich` / `join`;
  `failFast` for `scan` / `reduce`.
- **Result shapes**: `{results, errors, sourceErrors, failure}` for
  `series` / `filter` / `scan`; `{value, errors, sourceErrors, failure}` for
  `reduce`; `{value, errors, failure}` for `enrich` / `join`.
- **`stopWhen` semantics**: check before yield, clean completion, native source
  cleanup. It did not become a cancellation option.
- **`undefined` as the drop signal** in `series`, `filter` and `pipe`; `enrich`
  still requires `{}` for a no-op patch.
