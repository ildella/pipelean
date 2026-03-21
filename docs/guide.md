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

## Features

#### Iterations: series / scan / filter

* **Error Strategies**
  - Built-in and first-class.
  - see [errors.md](./errors.md)

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
