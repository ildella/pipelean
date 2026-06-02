---
name: "Pipelean Core"
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
3. **`filter(items, predicate, options)`** (immediate) or **`filter(predicate, options)`** (curried): Stateless selection.
   - Predicate returns truthy to keep, falsy to drop.
   - Returns original items where predicate matched in `results`.
4. **`pipe(...fns)`**: Vertical composition.
   - Chains functions left-to-right.
   - If any step returns `undefined`, remaining steps are skipped (short-circuit).
5. **`retry(fn, { attempts, delay })`**: Configurable retry logic.
6. **`tryCatch(fn, { onStart, onSuccess, onError, onFinally })`**: Single function lifecycle hooks.
7. **`where(pattern)`**: Creates a predicate for strict equality object matching. Used with `filter`.

## Error Strategies
- **`failFast`**: Stops immediately on first error. `failure: {item, error}`.
- **`collect`**: Continues processing, collects all errors. `failure: false`. (Default for series)
- **`failLate`**: Collects all errors, sets `failure: true` at the end if any occurred.
- **`skip`**: Ignores errors entirely.

**Documentation**: Read full examples in [docs/reference.md](../../docs/reference.md) (or [online](https://github.com/ildella/pipelean/blob/master/docs/reference.md)).
