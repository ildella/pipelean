# Guide

## Core Concepts

Pipelean provides four main tools, grouped by **data flow direction** (horizontal vs vertical) and **state dependency**:

- **Horizontal** tools process **multiple items** (lists/iterables) in sequence.
- **Vertical** tools transform **one item** through a chain of steps.
- Some tools are **stateless** (each step independent), others **stateful** (later steps depend on previous results).

  1. series (Horizontal / Stateless transformation)
  2. scan (Horizontal / Stateful transformation)
  3. filter (Horizontal / Stateless selection)
  4. pipe (Vertical / Composition)

## Error Strategies

All iteration functions (`series`, `filter`, `scan`) support four error strategies:

**failFast** (aliases: `fail`, `stopOnError`)
- Sets `failure: {item, error}` on first error
- Calls `onFailure({item, error})` immediately
- Stops iteration

**failLate**
- Collects all errors in `errors` array
- Sets `failure: true` after loop completes (only if `errors.length > 0`)
- Calls `onFailure(true)` if `failure` is truthy

**collect** (default for `series` and `filter`)
- Collects all errors in `errors` array
- Sets `failure: null`
- Does NOT call `onFailure`

**skip**
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: null`
- Does NOT call `onFailure`

---

## Features

#### Iterations: series / scan / filter

* **Error Strategies**
  - Built-in and first-class (see [Error Strategies](#error-strategies) above)

* **Universal Input**
  - Works on Arrays, Streams, Generators, and any Async Iterable.

* **Universal Mapper**
  - Handles both Synchronous and Asynchronous mapper functions automatically.

* **Structured Results**
  - Always returns a predictable object: `{ results, errors, failure }`.
  - Errors are treated as data, removing the need for consumer-side `try/catch` blocks.

* **Order Guarantee**
  - Because execution is sequential, output order strictly matches input order (no race conditions).

*  **Termination Control (`take`)**
  - Allows processing a subset of data (e.g., "process only the first N items").
  - Essential for working with infinite generators or streams.

#### Composition: pipe

Combine multiple filter predicates into a single reusable filter:

```js
import { filter, pipe } from 'pipelean'

const isValid = pipe(
  (user) => user.age >= 18,
  (user) => user.email.includes('@'),
  (user) => !user.blocked
)

const adults = await filter(isValid, users)
```

**Undefined Short-Circuit**: When any step returns `undefined`, remaining steps are skipped and `undefined` propagates out. Combined with `series` (which drops items when the operation returns `undefined`), this merges transformation and selection in a single pass:

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
2. **`failure` is truthy for**: `failFast` ({item, error}) and `failLate` (true)
3. **`failure` is null for**: `collect` and `skip`
4. **Strategy selection**: Choose based on whether failures are acceptable

Check out [patterns.md](./patterns.md).
