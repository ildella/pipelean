# Guide

## Core Concepts

Pipelean provides core tools grouped by **data flow direction** (horizontal vs vertical) and **state dependency**:

- **Horizontal** tools process **multiple items** (lists/iterables) in sequence.
- **Vertical** tools transform **one item** through a chain of steps.
- Some tools are **stateless** (each step independent), others **stateful** (later steps depend on previous results).

1. series (Horizontal / Stateless transformation)
2. scan (Horizontal / Stateful transformation — returns all intermediate results)
3. reduce (Horizontal / Pure reduction — returns only the final value)
4. filter (Horizontal / Stateless selection)
5. findSync (Horizontal / Stateless synchronous early-exit selection)
6. pipe (Vertical / Composition)
7. flow (Vertical / Stateful accumulation — one input, many enrichments, final accumulated value)

> **Sync variants** — The iteration functions above also have synchronous
> counterparts: `seriesSync`, `filterSync`, `findSync`, `scanSync`, and
> `reduceSync`. `pipeSync`, `flowSync`, and `tryCatchSync` are available too.
> They use the same error strategies and structured return shapes, but return
> directly instead of a Promise. `findSync` is sync-only for now, returns
> `{result, errors, failure}`, and exits at the first matching item.
>
> `scanReduce` and `scanReduceSync` are kept as aliases of `reduce` and
> `reduceSync` for backward compatibility.

## Error Strategies

All iteration functions (`series`, `filter`, `scan`, `reduce`) support four error strategies:

**failFast** (aliases: `fail`, `stopOnError`)
- Sets `failure: {item, error, index}` on first error
- Calls `onError({item, error, index, total})`, then `onFailure({item, error, index})` immediately
- Stops iteration; results array is empty on failure

**throw**
- Throws the error on first failure
- Does NOT return a structured result on failure
- Does NOT call `onError` or `onFailure`
- Useful for "let it crash" / fail-early patterns where the caller handles errors externally

**failLate**
- Collects all errors in `errors` array
- Sets `failure: {errors}` after loop completes (only if `errors.length > 0`)
- Calls `onFailure({errors})` if `failure` is truthy

**collect** (default for `series` and `filter`)
- Collects all errors in `errors` array
- Sets `failure: false`
- Does NOT call `onFailure`

**skip**
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: false`
- Does NOT call `onFailure`

---

## Features

#### Iterations: series / scan / reduce / filter

* **Error Strategies**
  - Built-in and first-class (see [Error Strategies](#error-strategies) above)

* **Universal Input**
  - Works on Arrays, Streams, Generators, and any Async Iterable.

* **Universal Mapper**
  - Handles both Synchronous and Asynchronous mapper functions automatically.
  - `filter` accepts patterns via `where()`: `filter(users, {active: true})` is equivalent to `filter(users, where({active: true}))`.
  - `findSync` accepts the same predicate forms and returns the first matching item without scanning the rest of the iterable.

* **Structured Results**
  - Always returns a predictable object: `{ results, errors, failure }`.
  - Errors are treated as data, removing the need for consumer-side `try/catch` blocks.

* **Contextual Callbacks**
  - `onProgress({item, result, index, total})` runs after each successful item.
  - `onError({item, error, index, total})` runs for handled item errors.
  - `total` is included only when Pipelean can know it cheaply, or when the caller passes `total`.

* **Order Guarantee**
  - Because execution is sequential, output order strictly matches input order (no race conditions).

*  **Termination Control (`take`)**
  - Allows processing a subset of data (e.g., "process only the first N items").
  - Essential for working with infinite generators or streams.

#### Composition: pipe

Compose multiple operations into a single reusable function for `series()`:

```js
import { series, pipe } from 'pipelean'

const normalizeActiveUser = pipe(
  user => user.active ? user : undefined,
  user => user.email,
  email => email.toLowerCase()
)

const result = await series(users, normalizeActiveUser)
```

`pipe()` is Pipelean's operation composer. It chains functions left-to-right and preserves Pipelean's drop signal: when any step returns `undefined`, remaining steps are skipped and `undefined` propagates out. Combined with `series` (which drops items when the operation returns `undefined`), this merges transformation and selection in a single pass:

```js
import { series, pipe } from 'pipelean'

const result = await series(numbers, pipe(
  x => x % 2 === 0 ? x : undefined, // select: drop odds
  x => x * 2,                        // transform: double
))
// result.results = [4, 8, 12] from inputs [2, 4, 6]
```

#### Stateful accumulation: flow

When each step should enrich the **same** state object, use `flow()`. Define the operation pipeline once and call the returned function with different inputs. Each operation receives the current accumulated state and returns an **object patch** that gets shallow-merged in.

```js
import { flow } from 'pipelean'

const prepareAlbum = state => ({title: state.rawTitle.trim()})
const extractYear = state => ({year: parseYear(state.rawYear)})
const extractArtists = state => ({artists: state.artists ?? []})

const processAlbum = flow([
  prepareAlbum,
  extractYear,
  extractArtists,
])

const {value, errors, failure} = await processAlbum(input)
// value = {title, year, artists, ...input}
```

`flow()` differs from `pipe()` in three ways:

- The pipeline is defined upfront and reused with different inputs.
- Each step receives the **current accumulated state**, not the previous step's return value.
- The result is structured: `{value, errors, failure}` — never throws on handled errors.

`flow()` uses the same error strategies as `series` and `scan` (default `collect`). Operations can be sync or async. Return an empty object `{}` when a step has nothing to add — `undefined` is **not** a no-op signal. The merge is **shallow**: a later patch overwrites a top-level key but does not deep-merge nested objects.

#### Stateless sequential transform with merge: use `flow()` not nested spreads

If you find yourself writing `pipe(...lotsOfFunctionsThatReturnObjects)`, that's a sign you want `flow()` instead. `pipe()` chains value-in / value-out; `flow()` chains state-patch-in / state-patch-out and accumulates.

```js
// Before: hand-rolled accumulation
const input = {...}
const step1 = prepare(input)
const step2 = {...step1, ...enrich(step1)}
const step3 = {...step2, ...finalize(step2)}

// After: flow() defines the pipeline once
const process = flow([prepare, enrich, finalize])
const {value} = await process(input)
```

#### Wrappers

Pipelean also provides lightweight wrappers that add behavior to **individual functions**. These act as reusable middleware / lifecycle hooks and compose naturally with `pipe`.

- **`tryCatch(fn, options?)`**  
  Protects a single function with lifecycle hooks:  
  - `onStart`, `onSuccess`, `onError`, `onFinally`  
  - Captures errors without crashing the outer flow  
  - Enables deep telemetry (e.g., log exactly which step in a 5-step pipe failed)  
  - Works standalone or inside `series`/`scan`/`pipe`  
  - Ideal for centralized error reporting (Sentry, UI toasts, metrics) even outside pipelines  

- **`retry(fn, options?)`**
  Specialized for automatic retries
  - Configurable: times, delay
  - Retries only on specified errors (or all by default)
  - Composes cleanly in `pipe` chains (e.g. retry network calls but not validation)

---

## Key Principles

1. **`onError` ≠ error strategy**: `onError` is a callback, not a strategy
2. **`failure` is truthy for**: `failFast` (`{item, error, index}`) and `failLate` (`{errors}`)
3. **`failure` is falsy for**: `collect`, `skip`, and `throw` on success
4. **`throw` does not return on error**: It propagates the error to the caller
5. **Strategy selection**: Choose based on whether failures are acceptable
6. **`flow()` returns `{value, errors, failure}`**: never throws on handled errors unless you pick `rethrow`. The `value` is always the last successful accumulated state.
7. **Patches are shallow-merged in `flow()`**: top-level keys are overwritten; nested objects are not deep-merged. Return `{}` (not `undefined`) when a step has nothing to add.

Check out [patterns.md](./patterns.md).
