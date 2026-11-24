# Pipelean for functional programmers

Pipelean is not a functional-effects library. It is a small set of **eager,
sequential** folds and maps that carry errors as data. If you know Elixir,
Scala/cats, or Haskell, this page maps the vocabulary — and says where the
analogy stops.

## The model in one table

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs), managed | `scan` | `reduce` |
| fold over **items**, pure sync, raw | — | `foldSync` |
| fold over **steps** (one input) | — | `enrich` |

`foldSync` is the raw `foldl`: pure, synchronous, no strategy and no report. It
is the same fold as `reduce`, returned as a value instead of a record — the FP
`foldl f z xs` you would write by hand, and the shape the managed `reduce`
deliberately wraps.

`enrich` is a `reduce` whose collection is the **operations**, not the data:

```js
enrich(ops)(input) === reduce(ops, (state, op) => ({...state, ...op(state)}), input)
```

In fold terms it is a `foldLeft` over endomorphisms `State -> Patch` with a
shallow `merge` combiner.

## Mapping

| Pipelean | Haskell | cats | Scala / Akka | Elixir |
|---|---|---|---|---|
| `series(items, f)` | `traverse f` / `mapM f` over an effectful function | `traverse` with a sequential `Async`/`Future` | `Source.mapAsync(1)`, sequential `traverse` | `Enum.map` + `Task`, `Task.async_stream(max_concurrency: 1)` |
| `mapSeries(items, f)` | `mapM f` with `throw` semantics (failure aborts) | `traverse` with a throwing `Async`, no `Either` accumulation | `Future.traverse` (first failure short-circuits) | `Task.async_stream` with `on_timeout: :exit`-style fail-fast |
| `filter(items, p)` | `filterM` | `filterA` / `filterM` | `Source.filter` | `Enum.filter` |
| `scan(items, f, z)` | `scanl f z` (`mapAccumL` for state + output) | `scanLeft` | `scanLeft`, `Source.scan` | `Enum.scan` |
| `reduce(items, f, z)` | `foldl f z` / `foldM` | `foldLeft` / `foldM` | `foldLeft`, `Source.runFold` | `Enum.reduce` |
| `foldSync(xs, f, z)` | `foldl f z` — pure, total functions, no effect | `foldLeft` — no `Either` | `foldLeft` — no `Try` | `Enum.reduce` — pure |
| `pipe(f, g, h)` | Kleisli composition `f >=> g >=> h` for `A -> Maybe B`, with `drop` as the empty case | `andThen` chain on `Option` | `Option.andThen` chain | `with` pipeline |
| `enrich([f, g])` | `foldl` over `A -> A` values with `merge` | `foldLeft` over endomorphisms | `foldLeft` over `A => A` | `Enum.reduce(ops, acc, &Map.merge(&2, &1.(&2)))` |
| `join({a, b})` | `traverse` over a record of effects | `parTraverse` over a record (no cancellation) | `Future.sequence` on a `Map` | `Task.async` + `Task.await_many` |
| `stopWhen(xs, p)` | lazy list + `takeWhile` | `takeWhile` | `Source.takeWhile` | `Stream.take_while` |
| `forever()` | `iterate (+1) 0` | `iterate` | `Source.unfold` | `Stream.iterate(0, &(&1 + 1))` |
| `failFast` | `Either` short-circuit | `Either` / `IO` failure | `Try` failure | `with` / `:error` tuple |
| `collect` / `failLate` | accumulating validation | `Validated` (`ValidatedNel`) | `Validated` | collect into `{:ok, _}` / list of errors |

## Where the analogy breaks

These are **shape** correspondences, not laws. Do not refactor on the assumption
that Pipelean satisfies the monad laws.

1. **`pipe` is a leaky Maybe.** It short-circuits only on `drop` (and, in 0.18,
   `undefined`), not on `null`. `null` is a perfectly good value that keeps
   flowing. That is a deliberate JavaScript pragmatism, and it means `pipe` is
   not lawful `Option` composition. (`tryCatch` rethrows by default; it only
   produces the `drop` signal when you opt in with `recover: () => drop`;
   `recover: () => undefined` also drops in 0.18.) In 1.0 `undefined` stops
   short-circuiting and only the explicit `drop` remains, which makes the
   Maybe analogy honest.
2. **Iterators are not `Either`.** `series`, `scan` and `reduce` return a record
   `{results | value, errors, sourceErrors, failure}`. They always return; they
   never short-circuit into a failure channel that you `flatMap` over. Errors are
   data you inspect after the run.
3. **`enrich` is not a `State` monad.** There is no `get`/`put`, no `runState`.
   It is a fold over patch functions with a shallow object merge — good enough
   for enrichment pipelines, not a general stateful effect.
4. **`join` is not a runtime.** It is `traverse` over a small record with no
   cancellation, no supervision, no concurrency cap. If you need structured
   concurrency, this is not it (nor does it pretend to be).
5. **Eagerness.** There are no free monads, no interpreters, no deferred
   programs. You call a function, work happens immediately, you get a report.
   This is the library's main design bet: debugger-friendly stack traces over
   purity.
6. **The raw tier throws.** `foldSync` and `mapSeries` are not `Either`: they
   return a bare value or throw the original error. They encode "a throw here is
   a bug", which is the opposite of the managed tier's "errors are data". Do not
   reach for them to model expected failure — that is what a strategy is for.

## Why `flow` was renamed

The old name collided with two established meanings:

- **fp-ts**: `flow` is left-to-right **function composition** — which is
  Pipelean's `pipe`, not its `enrich`.
- **Elixir**: `Flow` is a parallel stream-processing library (GenStage).

`enrich` says what it does: fold steps that enrich one record. In FP terms, it is
the `foldLeft` you would have written by hand over a list of patch functions.

## When you want a different tool

This page maps vocabulary; it does not turn Pipelean into an effects library. If
you need typed effects, a `Result` type, concurrent mapping or streams, the
honest answer is another library —
[When to reach for another library](alternatives.md) says which one and why.
