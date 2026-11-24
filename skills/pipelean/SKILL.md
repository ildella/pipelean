---
name: pipelean
description: Use when a project depends on `pipelean` and you are writing or reviewing sequential async work — batch/import jobs, rate-limited loops, daemon loops with backoff, cancellation (AbortSignal), error strategies, retry/tryCatch, folds and accumulators, enrichment pipelines, named concurrent tasks — or when deciding whether a hand-rolled loop should use pipelean at all. Also use when a `pipelean/*` ESLint rule fires. Do not use in projects without pipelean in package.json.
---

Do not rewrite working code just to use pipelean. The job is to choose correctly:
introduce pipelean where it earns its place, leave plain JavaScript where it does
not, and never change error or cancellation meaning in a rewrite.

Docs ship with the package, in `node_modules/pipelean/docs/`: `guide.md` (mental
model), `reference.md` (contracts), `patterns.md` (recipes and the rewrite
checklist), `examples.md`, `eslint.md`. Read only the section for the API you
picked — the links below land on it.

## 0. Gate: does this code need pipelean?

| Situation | Decision |
|---|---|
| One `await`, or a pure sync `map` / `filter`, with no failure policy and no lifecycle | Plain JavaScript — do not introduce pipelean |
| A loop that produces values (async generator source) | Plain `for` + `yield` — loops belong there |
| Several async steps whose failure policy, report, or lifecycle is explicit | Pipelean — see §2 |
| The same work must run concurrently | `Promise.all` / p-map — `series` is sequential, `join` is only for a few named, different tasks |
| Failure is not handled at all and nobody reads the outcome | Fix the policy first; a pipelean call alone does not make it safe |

Pipelean earns its place when the run needs at least one of: an explicit
**failure policy**, a **lifecycle** (progress, pacing, cancellation), a
**structured report** to inspect, or a **reusable pipeline**. When none apply,
native code is clearer. "This is a `forEach`" is not a reason.
→ [When plain JavaScript is clearer](node_modules/pipelean/docs/guide.md#when-plain-javascript-is-clearer)

## 1. Classify before choosing

1. **Independent or dependent?** Item N needs item N-1's output → fold.
2. **How many inputs?** Many → `scan` / `reduce` / `foldSync`. One input through
   many operations → `enrich` (or `pipe` when steps return values, not patches).
3. **Bug or data?** "This record is bad" is data, handled by a strategy.
   "This cannot happen" is a bug: it must throw.
4. **Is there a lifecycle?** Pacing, progress, `take`, cancellation → only the
   async iterators have them; a sync iterable takes the `*Sync` twin.

## 2. Pick the tool

| Instead of | Use |
|---|---|
| `forEach`, loop + `try/catch`, many independent items | `series` |
| an async `.map` that must throw on first failure | `mapSeries` / `mapSeriesSync` |
| `Promise.all` / `allSettled` on a few named tasks | `join` |
| `.reduce`, pure sync (sums, counts, indexes) | `foldSync` |
| `.reduce` that is async or needs a report | `reduce` |
| `.reduce` where every intermediate matters | `scan` |
| nested spreads threading state through steps | `enrich` |
| value in → value out, may bail | `pipe` |
| `items.filter(pred)` / `.find(pred)` with a report | `filter` / `findSync` |
| `if (failure) throw failure.error` | `assertOk(result)` |
| a reusable boundary around ONE operation (observe + failure policy) | `tryCatch` / `tryCatchSync` |
| a loop that produces values | plain generator that yields |

Fold over **items** → `scan` / `reduce` / `foldSync`. Fold over **steps** of one
input → `enrich`. Many items with a concurrent map over a homogeneous
collection: p-map, not `join`. This table routes the common cases; for every
combinator and source adapter — sync twins included, with input, output, default
strategy and `undefined` handling — the single comparison is
[How to choose](node_modules/pipelean/docs/reference.md#how-to-choose).

## 3. Consult only what you need

| You need | Read |
|---|---|
| Which API fits this shape | [reference: how to choose](node_modules/pipelean/docs/reference.md#how-to-choose) |
| `series`, `filter`, `findSync`, `mapSeries` and their options | [reference: iterators](node_modules/pipelean/docs/reference.md#iterators) |
| `scan`, `reduce`, `foldSync`, `recover` | [reference: folds](node_modules/pipelean/docs/reference.md#scan) |
| `enrich`, `assign`, per-step hooks | [reference: enrich](node_modules/pipelean/docs/reference.md#enrich) |
| `pipe`, `join` | [reference: composition](node_modules/pipelean/docs/reference.md#composition) |
| `stopWhen`, `forever` | [reference: source adapters](node_modules/pipelean/docs/reference.md#stopwhen) |
| `signal`, `pause`, `pauseOnErrors` | [reference: cancellation](node_modules/pipelean/docs/reference.md#cancellation-with-signal) |
| `assertOk`, `retry`, `tryCatch`, `where` | [reference: helpers and guards](node_modules/pipelean/docs/reference.md#assertok) |
| `*Sync` variants | [reference: sync variants](node_modules/pipelean/docs/reference.md#sync-variants) |
| Result shapes | [reference: result shapes](node_modules/pipelean/docs/reference.md#result-shapes) |
| Strategy matrix | [reference: error strategies](node_modules/pipelean/docs/reference.md#error-strategies) |

The five strategies are `collect` (`series`/`filter`/`enrich`/`join` default:
keep what worked), `failLate`, `failFast` (`scan`/`reduce` default: stops and
returns `failure` as data), `skip`, `rethrow` (throws the original error).
State the strategy whenever the default is not the policy you mean.

## 4. Transform without changing meaning

A rewrite is a behavior change until proven otherwise. Apply the full checklist:
[Rewriting a hand-rolled loop safely](node_modules/pipelean/docs/patterns.md#rewriting-a-hand-rolled-loop-safely).

- **Name the failure policy first.** Swallow-and-continue, stop-at-first, keep
  partial work — that is the `strategy`, and it must match the old loop.
- **Concurrency changes behavior.** `Promise.all` was concurrent; `series` is
  sequential with an order guarantee. Do not "modernize" a concurrent run into a
  serial one by accident.
- **`undefined` is the drop sentinel** in `series`, `filter`, `pipe`,
  `mapSeries`: `mapSeries` is not `Array.prototype.map`, and a loop that
  legitimately yielded `undefined` loses items. In `enrich`, `undefined` is an
  error — return `{}` for a no-op. The authoritative rule:
  [the `undefined` sentinel](node_modules/pipelean/docs/reference.md#the-undefined-sentinel).
- **`tryCatch` rethrows by default.** It is the single-operation execution
  boundary: hooks (`onStart`/`onSuccess`/`onError`/`onFinally`) only observe, and
  `recover(error) => value` is the explicit swallow/substitute seam
  (`recover: () => undefined` is the drop). Do not assume it swallows into
  `undefined` — that was the pre-0.17 default. A hook failure never masks the
  operation error (it is attached as `error.hookErrors`, or reported).
- **Cancellation has two seams.** `signal` stops between items and during
  `pause`; it never interrupts the in-flight mapper. Domain bounds ("stop after
  N", sentinel reached) are `stopWhen` on the source. Neither is a `break` in
  disguise.
- **Source errors are separate** (`sourceErrors` / `onSourceError`), not item
  errors, and bypass `recover`.
- **Match sync to sync:** a sync iterable takes the `*Sync` twin; `signal`,
  `pause` and `pauseOnErrors` on it are a `TypeError`. Its callbacks must be sync
  too — mapper, predicate, scanner, reducer, operation, hook and telemetry
  (`onError`, `onFailure`, `onSourceError`, `onProgress`): a returned thenable is
  a fatal `TypeError` naming the async twin — it escapes the strategy, never
  collected as data. Never pass an `async` callback to a `*Sync` combinator;
  use the async twin.
- **Prove the outcome is read.** Errors are data now: consume `errors` /
  `failure`, or guard with `assertOk` when a silent stop is unacceptable. Keep
  the original error identity for callers that match on message or
  `instanceof`.

### Three ways to get it wrong

- `{strategy: rethrow}` as a value extractor. It is raw async mode, not
  `unwrap`: use `assertOk(result)` for a managed result, `foldSync` for a pure
  sync fold. `pipelean/no-fold-rethrow` exists for this.
- `onError` next to `rethrow`. It never fires — dead configuration.
- Ignoring a `failFast` failure. The run stopped and returned `failure`; if
  nobody reads it the job dies silently. Guard with `assertOk`.

## 5. When a `pipelean/*` rule fires

All rules default to `warn` in `pipelean/eslint/config`. The warning is a prompt
to apply §0, not an order to rewrite: if the native code passes the gate, keep it
and suppress the rule at that site.

| rule | use instead |
|---|---|
| `no-array-foreach` | `series` — if the loop passes the gate |
| `no-array-reduce` | `foldSync` (pure sync) or `reduce` (report needed) |
| `no-array-map-async` | `series` / `mapSeries` |
| `no-promise-combinators` | `series` with a strategy; `join` for named tasks |
| `no-loop-without-yield` | generator source that yields (loops allowed there) |
| `no-fold-rethrow` | `foldSync`; `recover` in the options exempts |
| `no-sync-async-callback` | drop `async`; the `*Sync` twin needs sync callbacks |

→ [ESLint plugin](node_modules/pipelean/docs/eslint.md)
