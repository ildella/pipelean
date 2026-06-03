# Guide

## Core Concepts

Pipelean provides four main tools, grouped by **data flow direction** (horizontal vs vertical) and **state dependency**:

- **Horizontal** tools process **multiple items** (lists/iterables) in sequence.
- **Vertical** tools transform **one item** through a chain of steps.
- Some tools are **stateless** (each step independent), others **stateful** (later steps depend on previous results).

   1. series (Horizontal / Stateless transformation)
   2. scan (Horizontal / Stateful transformation — returns all intermediate results)
   3. scanReduce (Horizontal / Pure reduction — returns only the final value)
   4. filter (Horizontal / Stateless selection)
   5. pipe (Vertical / Composition)

## Error Strategies

All iteration functions (`series`, `filter`, `scan`, `scanReduce`) support four error strategies:

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

#### Iterations: series / scan / scanReduce / filter

* **Error Strategies**
  - Built-in and first-class (see [Error Strategies](#error-strategies) above)

* **Universal Input**
  - Works on Arrays, Streams, Generators, and any Async Iterable.

* **Universal Mapper**
  - Handles both Synchronous and Asynchronous mapper functions automatically.
  - `filter` accepts patterns via `where()`: `filter(users, {active: true})` is equivalent to `filter(users, where({active: true}))`.

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

Check out [patterns.md](./patterns.md).
