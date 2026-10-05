# Release Notes v0.10.0

## New Features

### New `join()` — fork/join over named concurrent tasks

`join(tasks, opts?)` runs a record of **named** async tasks at the same time and returns one structured result. Every branch starts immediately and `join` waits for all of them to settle — no scheduler, no cancellation, no ordering guarantee.

```javascript
import { join } from 'pipelean'

const {value, errors, failure} = await join({
  api: () => ping('api.example.com'),
  cdn: () => ping('cdn.example.com'),
})
// all good:  value = {api: 200, cdn: 200}, errors = [], failure = false
// cdn down:  value = {api: 200},
//            errors = [{operation: 'cdn', error, index: 1}], failure = false
```

- Input is a **record** (stable branch names), not a collection. A failed branch is reported as data in `errors` under its `operation` name; `value` keeps the successes.
- Passing a thenable (e.g. an un-awaited `Promise`) throws a `TypeError` instead of silently resolving an empty result.
- A branch resolving `undefined` is a success with value `undefined` — there is no drop signal in `join()`.
- `errors` follow **declaration order**, not completion order.
- Same error strategies as `flow()`: `collect` (default), `failLate`, `skip`, `rethrow`.
- For a concurrent map over a **homogeneous** collection, keep using p-map. `join()` is for a named set of different tasks.

---

## Notes

### `failFast` in `join()` behaves as `failLate`

Branches start together and cannot be stopped without an `AbortSignal`, so `failFast` (and its aliases `fail`, `stopOnError`) is treated as `failLate` inside `join()`.

### Async callbacks are awaited

`join()` awaits both `onError` and `onFailure`. The iteration combinators (`series`/`scan`/`flow`) still call `onFailure` synchronously, so an async `onFailure` there can reject after the result has resolved.

### ESLint: `no-promise-combinators` guidance updated

The `Promise.allSettled()` message now points to `join(tasks)` for named tasks, or `series(items, fn, {strategy: collect})` for positional collections.

---

For detailed API documentation, see [docs/reference.md](../reference.md#join).
