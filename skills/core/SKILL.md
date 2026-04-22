---
name: Pipelean Core
description: "Pipelean core functionalities for iteration, composition and error management for pure FP in pure Javascript. Use this skill when you need to perform sequential async operations, control flow, error handling, or batch processing using the `pipelean` library"
---

## Available Functions

1. **`series(items, fn, options)`**: Stateless sequential execution.
   - Runs `fn` on each item one by one.
   - `options`: `{ strategy: failFast | failLate | collect | skip, pause: ms, pauseOnErrors: boolean }`
   - Returns: `{ results, errors, failure }`
2. **`scan(items, scannerFn, initialValue)`**: Stateful sequential transformation.
   - `scannerFn(acc, item, index)`
   - Returns: `{ results, errors, failure }`
3. **`filter(predicate, items, options)`**: Stateless selection.
   - Predicate returns truthy to keep, falsy to drop.
   - Returns original items where predicate matched in `results`.
4. **`pipe(...fns)`**: Vertical composition.
   - Chains functions left-to-right.
   - If any step returns `undefined`, remaining steps are skipped (short-circuit).
5. **`retry(fn, { attempts, delay })`**: Configurable retry logic.
6. **`tryCatch(fn, { onStart, onSuccess, onError, onFinally, rethrow })`**: Single function lifecycle hooks.

## Error Strategies
- **`failFast`**: Stops immediately on first error. `failure: {item, error}`.
- **`collect`**: Continues processing, collects all errors. `failure: null`. (Default for series)
- **`failLate`**: Collects all errors, sets `failure: true` at the end if any occurred.
- **`skip`**: Ignores errors entirely.

**Documentation**: Read full examples in [docs/reference.md](../../docs/reference.md) (or [online](https://github.com/ildella/pipelean/blob/master/docs/reference.md)).
