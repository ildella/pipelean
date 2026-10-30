# Release Notes v0.11 → v0.12

## The fold model, spelled out

Three functions carried the "stateful accumulation" label: `scan`, `reduce` and
`flow`. Consumers kept asking which one to use. They are not three primitives:

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

`scan` and `reduce` are one engine with two result shapes. `enrich` is the same
fold where the collection is the operations:

```js
enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)
```

## Breaking changes

### `flow()` → `enrich()`

Hard rename, no alias, in both async and sync flavours (`enrich` / `enrichSync`).
Rationale: `flow` already means something else in two ecosystems your users know.

- **fp-ts**: `flow` is left-to-right function composition — that is Pipelean's
  `pipe`, not its accumulator.
- **Elixir**: `Flow` is a parallel stream-processing library.

`foldSteps` is the documentation spelling for the trio (`scan` folds items and
keeps intermediates, `reduce` folds items and keeps the last, `foldSteps` folds
steps) — it is not an export.

Migration:

```js
// Before
import { flow } from 'pipelean'
const process = flow([prepare, parse, finalize])

// After
import { enrich } from 'pipelean'
const process = enrich([prepare, parse, finalize])
```

### `tryCatch()` returns `undefined` on error, not `null`

`undefined` is Pipelean's drop signal, so a wrapped failure now composes:
`pipe` short-circuits and `series` drops the item. Previously a failed step
produced `null`, which flowed onward as a value.

```js
const data = (await safeFetch(url)) ?? fallback
```

### `scanReduce()` / `scanReduceSync()` removed

They were aliases of `reduce` / `reduceSync`.

### `storePartialResults` is no longer a public option

`scan` always keeps every intermediate; `reduce` always keeps the final value.
The option made the pair look like one function with a flag, which fed the
"why do I need both?" confusion.

## Documentation

- README rebuilt around a decision table and grouped features. Each core
  function now states **use when**, **don't use when** and **gotchas**.
- New [FP mapping](../fp-mapping.md): Pipelean ↔ Haskell, cats, Scala/Akka,
  Elixir — including where the analogy breaks.
- New "Limitations" section: eager execution, no cancellation, no concurrency
  cap outside `join`, `undefined` as a drop sentinel, no TypeScript types yet.
- Result-shape and strategy-default tables, so `value` vs `results` and
  `collect` vs `failFast` stop being guesswork.
- Agent skills updated to the new vocabulary and the fold model.

## Unchanged on purpose

- Strategy defaults: `collect` for `series`/`filter`/`enrich`/`join`;
  `failFast` for `scan`/`reduce`. Now documented as a rule.
- `enrich` returns `{value, errors, failure}` without `sourceErrors` (like
  `join`), because its steps are a fixed array — a source error is impossible.
- `scan` + `failFast` still clears `results`; documented as a limitation.
