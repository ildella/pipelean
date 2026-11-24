# Design Principles & Architecture

## Core motivations

1) do NOT swallow errors and inconsistencies during arrays sync and async operations
2) avoid boilerplate error management (and BAD error management)

Point number one includes *thrown errors* as well as JavaScript *built-in inconsistencies*: undefined and null.

## Pragmatism Over Purity.

We built this library to be a practical tool for executing tasks.

Our focus is eager execution, not the "Iterator-First" style (lazy, yielding generators) that many functional libraries adopt. For the core operations, eager execution has concrete advantages:

  * Debugging is easier: stack traces are straightforward because work happens immediately.
  * Control is explicit: you find out whether an operation fails right away.
  * Simplicity: no need to understand generators and composition patterns just to run a list of tasks.

Our Approach: Eager Execution.

The immediate call form starts work when you call it; a curried run (`series(fn)`) starts when you apply it to items. Either way there is no deferred program to build and interpret. You get a structured report back.

This is a focus, not a rejection of lazy iterators. Pipelean *consumes* async iterables (arrays, generators, anything `for await` can consume) through `series`/`scan`/`reduce`/`filter`; `enrich` and `pipe` work on one value at a time. When you need to *build* a lazy producer — for example an async generator that yields pages — pipelean steps aside: write a standard JavaScript generator and let it yield. The `no-loop-without-yield` lint rule encodes exactly this boundary: the only loops pipelean allows are the ones inside a generator that yields. `stopWhen` follows the same rule: it is a tiny yielding adapter (a producer, not an iterator), shipped because every consumer needed the same five lines of stop logic.

## Library map

One core, one cross-cutting policy, a set of shortcuts derived from the core, and
a few orthogonal tools. Everything else in the library is a decision made *on
top of* the core, not a peer of it.

| Layer | APIs | Role |
|---|---|---|
| **Core: iteration** | `series` | many independent items, one at a time |
| **Core: accumulation** | `scan`, `reduce` | a fold, where each item needs the previous value |
| **Policy** | `collect`, `failFast`, `failLate`, `skip`, `rethrow` | the failure policy of a run |
| **Shortcuts over the core** | `filter`, `mapSeries`, `findSync`, `foldSync`, `enrich` | the core with one decision already made |
| **Composition & concurrency** | `pipe`, `join` | orthogonal to the core |
| **Operation tools** | `tryCatch`, `retry` | one function, wrapped |
| **Guards & helpers** | `assertOk`, `where`, `assign`, `delay` | results, predicates, steps, waits |
| **Sources & lifecycle** | `stopWhen`, `forever`; `signal`, `pause`, `take` | what feeds a run, and how it stops |
| **Sync mirror** | `*Sync` | the same layers, synchronous |

**Scope** is the second axis: what an API owns. It is what keeps `stopWhen`,
`forever` and `retry` off the same plane as the strategies.

| Scope | What it owns | APIs |
|---|---|---|
| source | produces, or ends, an iterable | `stopWhen`, `forever` |
| run | one execution over a source, with a policy | `series`, `scan`, `reduce` |
| policy | the failure policy of a run | the five strategies |
| operation | one call to one function | `tryCatch`, `retry` |
| fold step | one step of an in-memory fold, and the pipeline that runs them | `enrich`, `assign` |
| result | a finished outcome | `assertOk` |
| composition | a value through ordered steps | `pipe` |
| concurrency | a few named branches at once | `join` |
| predicate | a reusable item predicate | `where` |
| wait | a plain timed wait | `delay` |

The two axes answer different questions. **Layer** says what an API is derived
from — a `filter` is a `series` with a truthiness decision, not a new engine.
**Scope** says what it is allowed to decide — a `retry` wraps a call and never
touches the run's policy. When two APIs look similar, compare them on both axes
before adding one.

## Terminology

The vocabulary we have established for the pipelean project, grouped by the layer
that owns it.

### Core

  * **Iteration** (Horizontal): The process of traversing a list of items one by one. This is the "width" of the process.
       Core implementation: `series`. `filter` is a shortcut over the same engine; `findSync` is its sync first-match form.

  * **Fold** (Vertical, accumulating): The process of folding a collection into an accumulator. Two collections are possible: the *items* (many inputs, each step depends on the previous one) and the *steps* (one input, many enrichments).
       Core implementations: `scan` (items, every intermediate), `reduce` (items, final value only). Shortcut: `enrich` (steps, final value only).

       There are **two managed result shapes plus one raw sync fold**: `scan` keeps every intermediate (`{results, …}`), `reduce` keeps the final value (`{value, …}`), and `foldSync` keeps the final value with no report at all. `foldSync` is not a third engine: it is a plain `for...of` fold over a sync iterable that returns the accumulator and lets the original error propagate. It exists because a pure, synchronous, bug-or-nothing fold (a sum, a count, an index) has no use for a strategy, a report or a `.value` unwrap — the raw shape *is* the whole contract.

       Why raw is sync-only: an async fold in the wild is a service loop, and a service loop needs `recover` (survive a failed round), `signal` (lifecycle stop) and `pause` (cadence). Those options belong to the managed API; shipping an async raw fold would either drop them or re-invent the engine. Sync folds need none of them, so the raw form can be honest. Precedent: `findSync` is sync-only for the same reason.

       `scan` and `reduce` are one engine with two result shapes. `enrich` is the same fold where the collection is the operations array:
       `enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)`.

  * **Operation** (the value-level unit): The function passed to an iterator (like `series`) or to a fold over steps (`enrich`). It can be a simple function or a composed function (`pipe`).
    - *Transform* (Mapping): An operation that changes the shape or value of an item. (A→B).
    - *Selection* (Filtering): An operation that decides whether to keep or drop an item. (A→A or A→∅). In our merged model, this is signaled by returning `drop` (or `undefined`, in 0.18).
    - *Patch* (Enrichment): An operation in `enrich()` that returns an object shallow-merged into the accumulated state. `{...state, ...patch}`.

  * **Drop Signal**: Returning `drop` from an operation (mapper in `series`, or any step in `pipe`) signals that the item should be dropped from results. `drop` is a registered symbol (`Symbol.for('pipelean.drop')`) exported by the library, so it is immune to module duplication. This is how `filter` works internally and how selection-in-pipes works. `drop` is NOT treated as a valid return value — it is the sentinel for "skip this item." In 0.18 `undefined` still drops for backward compatibility; the `series` family accepts `onUndefined: 'error'` to make legacy `undefined` a fatal policy error, and 1.0 flips the default so `undefined` becomes an ordinary value. `filter` / `findSync` read truthiness, so `drop` is simply falsy there and `onUndefined` does not apply. In `enrich()`, an operation that has nothing to add must return `{}`; `drop` and `undefined` are step errors. Folds (`scan`, `reduce`, `foldSync`) and `join` never drop: there, `drop` and `undefined` are ordinary values.

### Policy

  * **Strategy**: one of `collect`, `failFast`, `failLate`, `skip`, `rethrow`. It owns the run's failure policy — what happens to a failed item and what the outcome says. It is an option of the run, not of an operation: an operation that needs to substitute a value uses `tryCatch`'s `recover`, and a fold that needs to survive a failed step uses the fold `recover` seam.

  * **Recovery** (Fold-local seam): The `recover` option on `scan` / `reduce`. When the scanner throws, it receives `{error, item, index, state, total?}` — `state` is the accumulator before the failed item — and returns the next accumulator. A recovered error is consumed (no `errors` entry, `failure` stays false); if `recover` throws, the thrown error becomes the item error and the normal strategy applies. It is not a strategy: strategies still own the no-recovery path and the end-of-run outcome, source errors bypass it, and it exists only where there is an accumulator to recover into.

### Shortcuts over the core

  * **Locked-strategy map**: `mapSeries` / `mapSeriesSync` are **not** new primitives. They are `series` / `seriesSync` with the strategy fixed to `rethrow` and the report unwrapped to `.results`; every other option passes through (`take`, `total`, `onProgress`, `pause`, `pauseOnErrors`, `signal`, `onUndefined`; `mapSeriesSync` rejects the async-only `pause`, `pauseOnErrors` and `signal` with a `TypeError`, like every sync twin). The lock is validated (any other strategy is a `TypeError`) so the wrapper cannot silently override a caller's intent. The error callbacks are validated too: `onError` / `onFailure` / `onSourceError` are rejected, because under the locked `rethrow` they could never fire. They inherit the `drop` (and, in 0.18, `undefined`) drop signal and the silent-rethrow semantics of `series(..., {strategy: rethrow})`, which is why they are documented as a sequential map with throw semantics, not as `Array.prototype.map`.

  * **Per-step hooks** (not run-level lifecycle): `enrich` / `enrichSync` accept `onStepStart({operation, index, total})` before each operation and `onStepSuccess({operation, patch, index, total})` after its patch is validated and merged. They are telemetry, in the same category as `onProgress` and `onError`: they observe the fold, they do not own resources. The 0.13 note "no lifecycle hooks" still holds in its original scope — there are no before/after-**run** hooks and no automatic resource cleanup; `tryCatch` remains the single-function execution boundary. `enrich` rejects the run lifecycle (`signal`, `pause`, `take`, `onProgress`, …) because a step fold in memory has no source to pull.

### Composition & concurrency

  * **Composition** (Vertical): The process of chaining functions together to run sequentially on a single item. This is the "depth" of the process. Value in, value out; nothing is merged.
       Implementation: `pipe`.

  * **Fork** (Concurrent fan-out): The process of starting a named set of heterogeneous tasks at the same time and joining their outcomes into one result. This is not a scheduler: no concurrency cap, no cancellation, no ordering guarantee, no process supervision — just I/O concurrency on the same event loop. Every branch starts immediately and completion order never affects the shape of the result. Implementation: `join`. Because every branch has already started, `failFast` behaves as `failLate` there.

### Operation tools

  * **Operation boundary** (single function): `tryCatch` / `tryCatchSync` give one operation the same composable execution contract the iterators give a run: invocation, optional lifecycle hooks, and an explicit failure policy. Hooks and `recover` receive one context object — `{args, name}` plus `error` or `result` where relevant — where `args` is a copy of the invocation's argument list and `name` is the optional operation label. The operation's outcome is primary: `onStart` gates the operation, `recover` is the only seam that substitutes a value, and no other hook masks an operation error. The default policy is **rethrow** (the wrapper never swallows); `recover({error, args, name}) => value` is the one explicit seam where a failure becomes a value (`recover: () => drop` is the spelled-out drop). A hook failure never masks the operation error: on the failure path it is preserved as a secondary attached to the primary (`error.hookErrors`), best effort — if the primary cannot carry the property the hook error is dropped, with no console reporting. This is the single-operation analogue of `recover` on the folds, and it is what lets an app turn a raw function into a reusable, observable, policy-bearing operation.

  * **Retry** (single function): `retry` re-runs one call a fixed number of times, with a fixed delay, then rethrows the last error. It owns no policy: the surrounding run's strategy still sees the final failure.

### Sources & lifecycle

  * **Source adapter**: an iterable that a consumer cannot tell apart from an array. `stopWhen` ends a source on a predicate and `forever` produces unbounded ticks; they are producers, not iterators, and they carry no policy. `signal`, `pause` and `take` are the run's lifecycle options and stay with the consumer.

### Results

  * **Outcome**: The structural result returned by the managed API: the same envelope everywhere — `{payload, errors, sourceErrors, failure}`, where the payload is `results` for a run that keeps many values or `value` for one. `scan` keeps every intermediate in `results`; `reduce` keeps the final accumulator in `value`; `findSync` keeps the first match in `value` (`result` is a deprecated, non-enumerable alias removed in 1.0, and `value` is `undefined` when nothing matched). `enrich()` returns `{value, errors, sourceErrors, failure}` — `value` is the final accumulated state, not a results array, and `sourceErrors` is always empty. `join()` returns `{value, errors, sourceErrors, failure}` — `value` maps successful branch names to their values, `sourceErrors` is always empty. `assertOk(outcome)` is the guard for callers that would otherwise ignore a truthy `failure`: it returns the same outcome, or throws the **original** underlying error with `.failure` attached (falling back to a wrapped `Error` with `cause` and `.failure` for a primitive, frozen or otherwise non-extensible, or attachment-rejecting throw value).
