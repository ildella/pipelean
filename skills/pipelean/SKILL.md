---
name: pipelean
description: Use when a project depends on `pipelean` and you are writing or reviewing sequential async work — batch/import jobs, rate-limited loops, daemon loops with backoff, cancellation (AbortSignal), error strategies, retry/tryCatch, folds and accumulators, enrichment pipelines, named concurrent tasks — or when deciding whether a hand-rolled loop should use pipelean at all. Also use when a `pipelean/*` ESLint rule fires. Do not use in projects without pipelean in package.json.
---

Do not rewrite working code just to use pipelean. The job is to choose correctly:
introduce pipelean where it earns its place, leave plain JavaScript where it does
not, and never change error or cancellation meaning in a rewrite.

Docs ship with the package, in `node_modules/pipelean/docs/`: `guide.md` (mental
model), `reference.md` (contracts), `patterns.md` (recipes and the rewrite
checklist), `examples.md`, `eslint.md`, and `alternatives.md` (when another
library is the answer). Read only the section for the API you picked — the links
below land on it.

## The map

| Layer | APIs | Role |
|---|---|---|
| **Core: iteration** | `series` | many independent items, one at a time |
| **Core: accumulation** | `scan`, `reduce` | a fold, where each item needs the previous value |
| **Policy** | `collect`, `failFast`, `failLate`, `skip`, `rethrow` | the failure policy of a run |
| **Shortcuts over the core** | `filter`, `mapSeries`, `findSync`, `foldSync`, `enrich` | the core with one decision already made |
| **Composition & concurrency** | `pipe`, `join` | orthogonal to the core |
| **Operation tools** | `tryCatch`, `retry` | one function, wrapped |
| **Guards & helpers** | `assertOk`, `where`, `assign`, `delay` | results, predicates, steps, waits |
| **Sources & lifecycle** | `stopWhen`, `forever`; `signal`, `pause`, `take` | what feeds a run, and how it stops |
| **Sync mirror** | `*Sync` | the same layers, synchronous |

Start from the core: `series` maps independent items, `scan` / `reduce` fold
dependent ones. The strategies are the failure policy of a run, not a layer above
it. The shortcuts are not peers of the core — `filter` is `series` with a
truthiness decision, `mapSeries` is `series` with `rethrow`, `foldSync` is
`reduceSync` with `rethrow`, and `enrich` is `reduce` over the steps.

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

For the run's edges, another library owns the transport: capped concurrent
mapping → p-map, queues/scheduling → p-queue or p-limit, retry with
backoff/jitter → p-retry, streaming/backpressure → exstream-js, push-based
sources → RxJS. Do not emulate those with `series` + options. Full map:
[When to reach for another library](node_modules/pipelean/docs/alternatives.md).

## 1. Classify before choosing

1. **Independent or dependent?** Item N needs item N-1's output → fold
   (`scan` / `reduce`). Otherwise → `series`.
2. **How many inputs?** One input through many operations → `enrich` (steps
   return patches) or `pipe` (steps return values, no accumulation).
3. **Does a shortcut already match?** `filter` (selection), `mapSeries`
   (throw-on-first), `foldSync` (pure sync fold), `findSync` (first match,
   sync), `enrich` (steps over one input) are the core with the decision made.
   Prefer the shortcut to a core call plus options.
4. **Bug or data?** "This record is bad" is data, handled by a strategy.
   "This cannot happen" is a bug: it must throw.
5. **Is there a lifecycle?** Pacing, progress, `take`, cancellation → only the
   async iterators have them; a sync iterable takes the `*Sync` twin.

## 2. Pick the tool

| Instead of | Use | Layer |
|---|---|---|
| `forEach`, loop + `try/catch`, many independent items | `series` | core |
| `.reduce`, pure sync (sums, counts, indexes) | `foldSync` | shortcut |
| `.reduce` that is async or needs a report | `reduce` | core |
| `.reduce` where every intermediate matters | `scan` | core |
| an async `.map` that must throw on first failure | `mapSeries` / `mapSeriesSync` | shortcut |
| `items.filter(pred)` / `.find(pred)` with a report | `filter` / `findSync` | shortcut |
| nested spreads threading state through steps | `enrich` | shortcut |
| `Promise.all` / `allSettled` on a few named tasks | `join` | concurrency |
| value in → value out, may bail | `pipe` | composition |
| `if (failure) throw failure.error` | `assertOk(result)` | guard |
| a reusable boundary around ONE operation (observe + failure policy) | `tryCatch` / `tryCatchSync` | operation |
| a call that must be retried a fixed number of times | `retry` | operation |
| a loop that produces values | plain generator that yields | — |

Fold over **items** → `scan` / `reduce` / `foldSync`. Fold over **steps** of one
input → `enrich`. Many items with a concurrent map over a homogeneous
collection: p-map, not `join`. This table routes the common cases; for every
combinator and source adapter — sync twins included, with layer, input, output,
default strategy and `drop` handling — the single comparison is
[How to choose](node_modules/pipelean/docs/reference.md#how-to-choose).

## 3. Consult only what you need

| You need | Read |
|---|---|
| Which API fits this layer and scope | [reference: how to choose](node_modules/pipelean/docs/reference.md#how-to-choose) |
| `series` and its run options | [reference: series](node_modules/pipelean/docs/reference.md#series) |
| `scan`, `reduce`, `recover` | [reference: scan](node_modules/pipelean/docs/reference.md#scan) |
| `filter`, `mapSeries`, `findSync`, `foldSync` | [reference: shortcuts](node_modules/pipelean/docs/reference.md#shortcuts-over-the-core) |
| `enrich`, `assign`, per-step hooks | [reference: enrich](node_modules/pipelean/docs/reference.md#enrich) |
| `pipe`, `join` | [reference: composition](node_modules/pipelean/docs/reference.md#composition) |
| `stopWhen`, `forever` | [reference: source adapters](node_modules/pipelean/docs/reference.md#stopwhen) |
| `signal`, `pause`, `pauseOnErrors`, `take` | [reference: cancellation](node_modules/pipelean/docs/reference.md#cancellation-with-signal) |
| `tryCatch`, `retry` | [reference: operation tools](node_modules/pipelean/docs/reference.md#operation-tools) |
| `assertOk`, `where`, `assign`, `delay` | [reference: guards and helpers](node_modules/pipelean/docs/reference.md#guards--helpers) |
| Which options an API accepts | [reference: unsupported options](node_modules/pipelean/docs/reference.md#unsupported-options) |
| What a strategy keeps per API | [reference: strategy × consumer](node_modules/pipelean/docs/reference.md#strategy--consumer) |
| `*Sync` variants | [reference: sync variants](node_modules/pipelean/docs/reference.md#sync-variants) |
| Result shapes | [reference: result shapes](node_modules/pipelean/docs/reference.md#result-shapes) |

The five strategies are `collect` (`series`/`filter`/`enrich`/`join` default:
keep what worked), `failLate`, `failFast` (`scan`/`reduce` default: stops and
returns `failure` as data), `skip`, `rethrow` (throws the original error).
`fail` and `stopOnError` were removed in 0.18: pass `failFast`. On `join`,
`failFast` behaves as `failLate`. State the strategy whenever the default is not
the policy you mean.

## 4. Transform without changing meaning

A rewrite is a behavior change until proven otherwise. Apply the full checklist:
[Rewriting a hand-rolled loop safely](node_modules/pipelean/docs/patterns.md#rewriting-a-hand-rolled-loop-safely).

- **Name the failure policy first.** Swallow-and-continue, stop-at-first, keep
  partial work — that is the `strategy`, and it must match the old loop.
- **Concurrency changes behavior.** `Promise.all` was concurrent; `series` is
  sequential with an order guarantee. Do not "modernize" a concurrent run into a
  serial one by accident.
- **`drop` is the drop sentinel** in `series`, `filter`, `pipe`,
  `mapSeries`: `mapSeries` is not `Array.prototype.map`, and a loop that
  legitimately yielded `drop` loses items. In 0.18 `undefined` still drops too;
  `series` / `mapSeries` accept `onUndefined: 'error'` to make legacy
  `undefined` fatal, and 1.0 flips the default. `onUndefined` belongs to the
  `series` family only: `filter` / `findSync` read truthiness and reject it.
  In `enrich`, `drop` and `undefined` are errors — return `{}` for a no-op.
  `scan` / `reduce` / `foldSync` / `join` never drop. The authoritative rule:
  [the `drop` sentinel](node_modules/pipelean/docs/reference.md#the-drop-sentinel).
- **Use only options the API honours.** `enrich` / `join` reject the run
  lifecycle (`signal`, `pause`, `take`, `onProgress`, …) and `recover`;
  `scan` / `reduce` reject `take`, `total`, `onProgress` and `onUndefined`;
  `mapSeries` rejects the error callbacks. The rejected option throws a
  `TypeError` naming it — fix the call, do not catch:
  [Unsupported options](node_modules/pipelean/docs/reference.md#unsupported-options).
- **`tryCatch` rethrows by default.** It is the single-operation execution
  boundary: `onStart` gates the call, the other hooks observe, and
  `recover({error}) => value` is the explicit swallow/substitute seam
  (`recover: () => drop` is the drop). Hooks and `recover` receive
  `{args, name}` plus `result` or `error`; `args` is a copy, and the optional
  `name` option labels the operation. Do not assume it swallows into `undefined`
  — that was the pre-0.17 default. A hook failure never masks the operation
  error: it is attached best effort as `error.hookErrors` and dropped if the
  primary cannot carry it (no console reporting); a hook failure after a
  successful operation is thrown as itself.
- **Cancellation has two seams.** `signal` stops between items and during
  `pause`; it never interrupts the in-flight mapper. Domain bounds ("stop after
  N", sentinel reached) are `stopWhen` on the source, and `take: 0` (or a
  pre-aborted signal) pulls nothing. Neither is a `break` in disguise.
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
