---
name: "Pipelean Functional Programming"
description: "General Functional Programming principles and patterns. Use this skill to enforce Pipelean's pragmatic functional programming standards and architectural principles on any codebase."
---

## Core Philosophy
1. **No swallowed errors**: Do not swallow errors or inconsistencies (`undefined`, `null`) during array sync/async operations.
2. **Pragmatism over Purity**: Our focus is eager execution with explicit results.
3. **No Boilerplate**: Avoid writing repetitive `try/catch` or manual iteration loops. Use `series`, `pipe`, `scan`, or `flow`.

## Coding Rules
- **No `Array.prototype.forEach`**: ForEach swallows promises and doesn't handle async errors correctly. Use `series` instead.
- **No raw `Promise` combinators**: Use `series` for positional collections, or `join` for named concurrent tasks, instead of `Promise.all` / `Promise.allSettled`. The `no-promise-combinators` rule flags them.
- **No `Array.prototype.reduce`**: Reduce is often unreadable and mixes state with iteration. Use `reduce` for simple reduction (sums, counts), `scan` for dependent stateful transformation where intermediate values matter.
- **Eager Execution**: Reach for `series`/`pipe`/`scan`/`flow` first — you get a structured report `{ results, errors, failure }` back immediately. When you genuinely need a lazy producer (e.g. a generator that streams progress events), that is a supported escape hatch: write a standard JavaScript generator and let it yield. The `no-loop-without-yield` rule allows loops only inside a generator that yields.
- **Undefined Short-Circuit**: When composing operations (via `pipe`), returning `undefined` signals dropping the item (selection/filtering).

## State accumulation: prefer `flow()` over hand-rolled spreads

If you find yourself writing nested spreads to thread state through a chain of enrichments (`const result = {...step1, ...step2(step1), ...step3(step2)}`), use `flow()` instead. `flow()`:

- Defines the pipeline once and reuses it with different inputs.
- Returns `{value, errors, failure}` — never throws on handled errors.
- Uses the same strategies (`collect` by default, `failFast`, `failLate`, `skip`, `rethrow`) as `series` and `scan`.
- Shallow-merges patches (`{...state, ...patch}`) — top-level keys are overwritten, nested objects are not deep-merged.

```js
import { flow } from 'pipelean'

const processAlbum = flow([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
  state => ({artists: state.artists ?? []}),
])

const {value, errors, failure} = await processAlbum(input)
```

Operations in `flow()` must return a **non-null, non-array object** (the patch). Return `{}` when a step has nothing to add — `undefined` is not a no-op signal. Use `flowSync` for synchronous pipelines.

## Fork/join: prefer `join()` over `Promise.allSettled`

When several **named** async tasks should run at the same time and be reported together, use `join()` — not `Promise.allSettled` with manual `{status, value, reason}` unpacking.

- Branches are named: a failure is reported as data under its `operation` name, so the rest of the report is unaffected.
- Returns `{value, errors, failure}` — same strategies as `flow` (`collect` by default).
- `join()` always waits for every branch; there is no cancellation. `failFast` behaves as `failLate`.
- For a concurrent map over a **homogeneous** collection, use p-map instead.

```js
import { join } from 'pipelean'

const {value, errors} = await join({
  api: () => ping('api.example.com'),
  cdn: () => ping('cdn.example.com'),
})
```

**Documentation**: Read the full architectural philosophy in [docs/architecture.md](../../docs/architecture.md) (or [online](https://github.com/ildella/pipelean/blob/master/docs/architecture.md)).
