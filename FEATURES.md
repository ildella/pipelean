# FEATURES.md

## safeMap

### `safeMap` Feature Set

*   **Error Strategies**
    *   **Fail Fast:** Stops execution immediately upon the first error.
    *   **Collect:** Gathers all errors and continues processing until the end.

*   **Termination Control (`take`)**
    *   Allows processing a subset of data (e.g., "process only the first N items").
    *   Essential for working with infinite generators or streams.

*   **Universal Input**
    *   Works on Arrays, Streams, Generators, and any Async Iterable.

*   **Universal Mapper**
    *   Handles both Synchronous and Asynchronous mapper functions automatically.

*   **Functional Flexibility**
    *   **Immediate Mode:** `safeMap(data, fn)` runs instantly.
    *   **Curried Mode:** `safeMap(fn)(data)` creates a reusable executable, ideal for pipelines.

*   **Order Guarantee**
    *   Because execution is sequential, output order strictly matches input order (no race conditions).

*   **Structured Results**
    *   Always returns a predictable object: `{ results, errors, failure }`.
    *   Errors are treated as data, removing the need for consumer-side `try/catch` blocks.
