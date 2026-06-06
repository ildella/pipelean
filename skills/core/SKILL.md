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
3. **`reduce(items, scannerFn, initialValue)`**: Pure reduction — like `scan` but returns only the final accumulated value.
   - `scannerFn(acc, item, index)`
   - Returns: `{ value, errors, failure }`
   - Use for sums, counts, and simple accumulation where intermediate values aren't needed.
4. **`filter(items, predicate, options)`** (immediate) or **`filter(predicate, options)`** (curried): Stateless selection.
   - Predicate returns truthy to keep, falsy to drop.
   - Returns original items where predicate matched in `results`.
5. **`pipe(...fns)`**: Vertical composition.
   - Chains functions left-to-right.
   - If any step returns `undefined`, remaining steps are skipped (short-circuit).
6. **`flow(operations, options?)`**: Stateful accumulation across one input.
   - Define the operation pipeline once. The returned function runs it against different inputs.
   - Each operation `op(state)` returns an **object patch** that gets shallow-merged into the state.
   - `options`: `{ strategy: failFast | failLate | collect | skip, onError, onFailure }`
   - Returns: `{ value, errors, failure }`
   - Operations can be sync or async. `flowSync` is the synchronous counterpart.
7. **`retry(fn, { attempts, delay })`**: Configurable retry logic.
8. **`tryCatch(fn, { onStart, onSuccess, onError, onFinally })`**: Single function lifecycle hooks.
9. **`where(pattern)`**: Creates a predicate for strict equality object matching. Used with `filter`.

## Error Strategies
- **`failFast`**: Stops immediately on first error. `failure: {item, error}`.
- **`collect`**: Continues processing, collects all errors. `failure: false`. (Default for `series` and `flow`)
- **`failLate`**: Collects all errors, sets `failure: true` at the end if any occurred.
- **`skip`**: Ignores errors entirely.

## flow() vs pipe()
- `flow()` is for **stateful accumulation**: each step sees the full accumulated state and returns a patch. The pipeline is defined once and reused with different inputs. The result is `{value, errors, failure}`.
- `pipe()` is for **value-in / value-out** composition: each step receives the previous step's return value. Returns a Promise (or value, for `pipeSync`).

```js
import { flow } from 'pipelean'

const processAlbum = flow([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
  state => ({artists: state.artists ?? []}),
])

const {value, errors, failure} = await processAlbum(input)
```

`flow()` normalizes error shapes:
- `errors[i]` is `{operation, error, index}` where `operation` is the function's `name` or `operation-${index}` for anonymous functions.
- `failure` is `{operation, error, index}` for `failFast` and `{errors}` for `failLate`.
- `onError` and `onFailure` callbacks receive the same normalized shapes.

**Documentation**: Read full examples in [docs/reference.md](../../docs/reference.md) (or [online](https://github.com/ildella/pipelean/blob/master/docs/reference.md)).
