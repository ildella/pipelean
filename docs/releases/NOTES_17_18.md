# Release Notes v0.17 → v0.18

## The gap this release closes

0.18 is the release where the library stops accepting configuration it cannot
honour. Four seams had the same shape of problem: a documented contract and a
runtime that shrugged.

- **The result envelope had four shapes.** `series` returned `results`, `reduce`
  returned `value`, `findSync` returned `result`. `sourceErrors` appeared on the
  iterators and disappeared on `enrich` / `join`. And `failure` was typed
  `false | object`: a success sentinel, an item context, a source context and a
  `failLate` aggregate all sharing one slot with no way to tell them apart
  except by sniffing keys.
- **The strategy option was advisory.** An unknown strategy silently behaved
  like `collect`, and `fail` / `stopOnError` were still accepted spellings of
  `failFast` long after their deprecation.
- **Options were accepted and ignored.** `take: -1`, `take: 1.5`, `total: NaN`,
  `retry(fn, {attempts: 0})`, `scan(items, fn, 0, {take: 1})`,
  `filter(items, p, {onUndefined: 'error'})` — all accepted, most inert. The
  caller believed the run was configured and got silence.
- **The drop signal was implicit.** `undefined` meant "no value" and dropped,
  with no way to say so out loud.

The fixes are individually small. Together they are the 0.18 contract: one
envelope, an enforced policy, validated configuration, and a named drop
sentinel. The documentation reorganisation and the new alternatives page ride
along; no runtime behavior depends on them.

This is a **0.x minor with behavior changes**. The migration section at the top
of [docs/migration.md](../migration.md#0180-one-result-envelope-everywhere)
lists every one of them, and none requires rewriting a call that was already
correct.

## One envelope: four keys, same order

Every managed combinator returns `{payload, errors, sourceErrors, failure}`,
in that order. The payload key names its cardinality, not the combinator:

| APIs | payload | shape |
|---|---|---|
| `series`, `filter`, `scan` (+ sync twins) | `results` | `{results, errors, sourceErrors, failure}` |
| `reduce` (+ sync twins), `findSync` | `value` | `{value, errors, sourceErrors, failure}` |
| `enrich`, `enrichSync`, `join` | `value` | `{value, errors, sourceErrors, failure}` |

The raw shortcuts were never envelopes and do not become one: `mapSeries` /
`mapSeriesSync` still resolve to a bare array, `foldSync` still returns the
accumulator directly. `assertOk(result)` accepts either payload.

### Deprecated: `findSync.result`, use `value`

`findSync` was the only single-value API whose payload key was not `value`. Its
payload means exactly what `reduce`'s does — the one value the run selected, or
`undefined` when nothing matched — so the name now matches.

**This is a soft deprecation, not a breaking rename.** `value` is primary;
`result` stays as a non-enumerable, configurable getter on the same object, so
both accesses work and existing destructuring keeps working:

```js
const {value} = findSync(items, predicate)   // preferred
const {result} = findSync(items, predicate)  // still works until 1.0
```

`Object.keys` / spread see only the four envelope keys, and a no-match run
still returns `{value: undefined, errors: [], sourceErrors: [], failure: false}`.
`result` is removed in 1.0; nothing needs to change in 0.18.

### Additive: `sourceErrors` on `enrich`, `enrichSync` and `join`

A step fold and a task fork have a fixed source, so a source error cannot
happen there. The key used to be omitted; now it is always present and always
empty. Every managed result can be read with the same destructuring, and
generic code that guarded with `result.sourceErrors ?? []` can drop the guard.

### Documented: `failure` is a named union

The JSDoc now documents what the code always produced: `false` on success, an
item or step context under `failFast`, a source context for a dead source, and a
`{errors}` aggregate under `failLate` — per combinator, because `enrich` cannot
produce a source failure and `join` cannot produce a `failFast` item failure.
A documentation and editor-boundary change; the runtime payloads are unchanged.

## Changed: the strategy contract is enforced

- **`fail` and `stopOnError` are gone.** Both the imports and the strings are
  removed. `fail` and `stopOnError` as a `strategy` raise
  `TypeError: series() strategy "fail" was removed in 0.18; use failFast`.
- **An unknown strategy is a construction error.** It used to be treated like
  `collect`: the run continued and collected errors. It is now a `TypeError`
  naming the API and the accepted values, raised before the source is pulled:

  ```text
  series() unknown strategy "FailFast"; use collect, failFast, failLate, skip or rethrow
  ```

- **`'rethrow'` is still an alias of `'throw'`.** The exported `rethrow`
  constant is `{name: 'throw'}`; the string `'rethrow'` normalizes to the same
  strategy. This is the one alias that survives.
- **`mapSeries` / `mapSeriesSync` keep their `rethrow` lock.** They reject any
  other strategy at construction, as before; only the message now comes from
  the shared validator.

## Changed: no silent configuration

### `take` and `total` are validated

`take` must be a non-negative integer (`0` included). `total` must be a finite
non-negative number (`0` included). Anything else — negative, fractional,
`NaN`, `Infinity`, a string — is a `TypeError` raised before the run starts,
instead of a comparison that happened to produce whatever it produced.

`take` is accepted by `series`, `filter`, `mapSeries` (and their sync twins) and
by `findSync`. Folds, `enrich` and `join` reject it: they work in memory over a
fixed input, so there is nothing to stop pulling.

### A stopped run pulls nothing

Two off-by-one pulls are fixed:

- `take: 0` pulls **zero** items from the source. It used to pull the first one
  before stopping.
- An already-aborted `signal` pulls **zero** items. It used to pull the first
  one, then stop.

The same guard also covers an abort that lands during `pause` or during the
step: the next item is not pulled. The implementation uses `break`, not a manual
loop, so `iterator.return()` and generator `finally` cleanup are unchanged.

### `retry` validates at construction

`retry(fn, opts)` now rejects invalid configuration when the wrapper is built,
not on the first call:

- `fn` must be a function;
- `attempts` must be an integer `>= 1` (default `3`);
- `delay` must be a finite number `>= 0` (default `0`).

`attempts: 0` used to run an empty loop and throw `undefined`. The retry loop
itself is unchanged: it still retries, then throws the last error, and the
surrounding strategy still sees the failure.

### Known-but-unsupported options are rejected

An option an API knows but cannot honour is a trap: the caller believes the run
was configured. It is now a `TypeError` naming the option — for example
`enrich() does not support the "take" option` — raised before any work starts.

| API | rejected options |
|---|---|
| `scan` / `reduce` (+ sync twins) | `take`, `total`, `onProgress`, `onUndefined` |
| `findSync` | `onProgress`, `onUndefined` |
| `filter` / `filterSync` | `onUndefined` |
| `enrich` / `enrichSync` | `signal`, `pause`, `pauseOnErrors`, `onSourceError`, `onProgress`, `take`, `total`, `onUndefined` |
| `join` | `signal`, `pause`, `pauseOnErrors`, `onSourceError`, `onProgress`, `take`, `total`, `onUndefined` |

`recover` keeps its dedicated per-API message (folds consume it; `enrich` points
at `reduce`; `join` and `series` name the restriction). A key passed explicitly
as `undefined` is treated as omitted. This is a curated list of known options,
not a full allowlist — unknown keys are still ignored, and the allowlist is
planned for 0.19.

### `stopWhen` predicates are awaited

`stopWhen` now awaits the predicate before deciding whether to yield. An async
predicate used to return a Promise, which is always truthy, so the adapter
stopped on the first item. `stopWhenSync` now rejects a thenable predicate
result with a `TypeError` naming `stopWhen()` instead of treating the Promise as
truthy.

## Fixed: post-recover hook errors keep their order

After a successful `recover` the operation counts as successful, so the
success-path rule applies: the **first** hook failure is the thrown error, a
later one is attached to it as `error.hookErrors`. A hook error raised on the
failure path (a throwing `onError`) is that first failure — 0.17 demoted it to
secondary when a later hook threw:

```js
const h1 = new Error('onError hook')
const wrapped = tryCatch(fn, {
  onError: () => { throw h1 },
  recover: () => 'recovered',
  onFinally: () => { throw new Error('onFinally hook') },
})
// 0.17: threw the onFinally error, h1 in its hookErrors
// 0.18: throws h1, the onFinally error in h1.hookErrors
```

This aligns the runtime with the 0.17 release notes and migration guide; the
reference paragraph that documented the inverted order is corrected. A throwing
`recover` is unchanged: its error stays primary, with the earlier hook error
attached. Both `tryCatch` and `tryCatchSync` are fixed.

## Added: `drop`, and an opt-in for the 1.0 `undefined` policy

`drop` is now exported: a registered symbol (`Symbol.for('pipelean.drop')`) that
spells out "no value". Its meaning per consumer:

| Consumer | `drop` means |
|---|---|
| `series` / `seriesSync`, `mapSeries` / `mapSeriesSync` | item dropped, `onProgress` not called |
| `pipe` / `pipeSync` | short-circuit; the sentinel itself is returned |
| `filter` / `filterSync`, `findSync` | falsy: excluded / no match |
| `where` | never matches |
| `assign` | `{}` no-op patch |
| `enrich` / `enrichSync` | step error: *enrich steps cannot drop; return {} for a no-op* |
| `scan` / `reduce` / `foldSync` / `join` | ordinary value |

**`undefined` still drops in 0.18.** The release is additive: existing code
behaves exactly as before. The new `onUndefined` option on `series` /
`seriesSync` / `mapSeries` / `mapSeriesSync` lets you opt into the 1.0 behaviour
early:

```js
series(items, fn)                          // 0.18 default: undefined drops
series(items, fn, {onUndefined: 'error'})  // future behaviour: undefined is fatal
```

- The default is `'drop'`; no call site changes.
- `'error'` makes an `undefined` mapper result a fatal `TypeError` that escapes
  the run — it is never collected in `errors` / `sourceErrors` / `failure`. It is
  a policy error, not a strategy decision.
- `drop` is unaffected by the policy and keeps dropping.
- Any other value is a `TypeError` at construction.
- `onUndefined` belongs to the series family only; `filter`, `findSync`, folds,
  `enrich` and `join` reject it rather than ignoring it.

The migration section has the codemods that make 0.18 code 1.0-ready:
`x => cond ? x : drop` and `recover: () => drop`.

## Docs: one library map and an alternatives page

The docs now teach one structure instead of four overlapping models. The README,
guide, architecture page and agent skill share a single **library map** — core
(`series`; `scan` / `reduce`), policy, shortcuts, composition, operation tools,
guards, sources — and the reference is ordered by that map rather than by
history. Two tables carry the decisions that used to be scattered: strategy ×
consumer, and the options accepted or rejected per API.

New page: [`docs/alternatives.md`](../alternatives.md) explains when to reach
for p-map, RxJS, exstream-js or another library, how they combine with
Pipelean, and what Pipelean deliberately does not do.

No code change; existing anchors are preserved.

## What 0.18 does not do

0.18 is a step in the 1.0 direction, not 1.0. These are deliberately out of
scope:

- **The `onUndefined` default does not flip.** It stays `'drop'`; `'error'` is
  opt-in. The flip is a 1.0 change.
- **`pipe` does not keep `undefined`.** It still short-circuits on `undefined`
  in 0.18. Keeping it as an ordinary value — and the options through which a
  pipeline then names its drop policy — is 1.0 work.
- **`findSync.result` is not removed.** It is a working alias, removed in 1.0.
- **`normalizeOperationError` is not deprecated and not removed.** It is still
  the internal error-payload normalizer; its deprecation is planned for 0.19,
  removal for 1.0.
- **No `.d.ts` / type packaging.** The JSDoc types are the contract for now;
  shipped declarations are 1.0.
- **No `undefined`-drop warning phase.** A transition period that warns on
  implicit `undefined` drops is 0.19, not 0.18.
- **No full options allowlist.** 0.18 rejects known-but-inert options only.
- **No `total` on `join`.** The fork has no run lifecycle; adding `total` there
  is 0.19.
- **No `onUndefined` on `filter` / `findSync` / folds / `enrich` / `join`.** It
  remains a series-family option.

## Unchanged on purpose

- **`undefined` still drops** in `series` / `filter` / `pipe` / `mapSeries` (and
  sync twins). 0.18 names `drop`; it does not retire the old signal.
- **Strategy defaults**: `collect` for `series` / `filter` / `enrich` / `join`;
  `failFast` for `scan` / `reduce`. `foldSync` has no strategy at all.
- **The `false` sentinel** for `failure`. Switching it to `null` would break
  every `=== false` check for no gain.
- **The separate `sourceErrors` channel.** It is not merged into `errors`: a
  dead source bypasses `recover` and has its own callbacks, and that
  distinction is a contract guarantee.
- **`filter` / `findSync` read truthiness.** `drop` is one more falsy value;
  the predicate's return value is never placed in `results`.
- **`enrich` still needs `{}` for a no-op.** A step that returns `undefined` or
  `drop` fails through the strategy; there is no patch-level drop.
- **Folds and `join` never drop.** There, `drop` and `undefined` are ordinary
  values.

## Migration

`findSync.result` needs no change; the strategy aliases and the new validations
are the only code-visible breaks. See
[migration.md](../migration.md#0180-one-result-envelope-everywhere) for the
per-change notes, the two recommended codemods (`undefined` → `drop`,
`recover: () => undefined` → `recover: () => drop`) and the 1.0 preview.
