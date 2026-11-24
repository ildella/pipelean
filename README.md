# Pipelean

[![npm version](https://img.shields.io/npm/v/pipelean.svg)](https://www.npmjs.com/package/pipelean)
[![Build Status](https://github.com/ildella/pipelean/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ildella/pipelean/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sequential async pipelines with **first-class error handling**. Eager execution,
structured results, plain JavaScript — no framework, no scheduler, no monads to
learn.

## Why Pipelean?

Every async pipeline ends up hand-writing the same three things: the loop, the
`try/catch`, and the accumulator. Pipelean gives each one a name and a tested
implementation — and it never swallows an error.

```js
// Before: the failure policy is an accident
const results = []
for await (const page of pages(db)) {
  try {
    results.push(await importPage(page))
  } catch (error) {
    logger.error({page, error}) // swallow? abort? keep the rest?
  }
}
```

```js
// After: the failure policy is an explicit choice
import {series, collect} from 'pipelean'

const {results, errors} = await series(pages(db), importPage, {
  strategy: collect,
  onError: ({item, error}) => logger.error({item, error}),
})
// results: every page that worked
// errors:  [{item, error, index}] — data, not an exception
```

## Install

```sh
npm install pipelean
```

Node > 22.7, ESM. The ESLint plugin is a separate entry point
(`pipelean/eslint/config`) — importing it does not pull in the runtime.

## Quick start

One realistic run: fetch a list of URLs one at a time, spaced out, with live
progress and every failure collected as data.

```js
import {series, collect} from 'pipelean'

const {results, errors, failure} = await series(urls, fetchJson, {
  strategy: collect,                              // keep going, record failures
  pause: 200,                                     // ms between items
  onProgress: ({index, total}) => setStatus(`${index + 1}/${total}`),
  onError: ({item, error}) => log.warn(item, error.message),
})

if (errors.length) report(errors)                 // [{item, error, index}]
```

No `try/catch`, no hand-rolled loop, no silent swallow. Works on arrays,
generators and any async iterable.

<a id="around-the-four-models"></a>

## The shape of the library

One core, one cross-cutting policy, a set of shortcuts derived from the core,
and a few orthogonal tools. Find the layer, then the API.

| Layer | APIs | Role |
|---|---|---|
| **Core: iteration** | `series` | many independent items, one at a time |
| **Core: accumulation** | `scan`, `reduce` | a fold, where each item needs the previous value |
| **Policy** | `collect`, `failFast`, `failLate`, `skip`, `rethrow` | the failure policy of a run, chosen per call |
| **Shortcuts over the core** | `filter`, `mapSeries`, `findSync`, `foldSync`, `enrich` | the core with one decision already made |
| **Composition & concurrency** | `pipe`, `join` | orthogonal: one value through steps, or a few named branches at once |
| **Operation tools** | `tryCatch`, `retry` | one function, wrapped |
| **Guards & helpers** | `assertOk`, `where`, `assign`, `delay` | results, predicates, steps, waits |
| **Sources & lifecycle** | `stopWhen`, `forever`; `signal`, `pause`, `take` | what feeds a run, and how it stops |
| **Sync mirror** | `*Sync` | the same layers, synchronous |

`series`, `scan` and `reduce` are the core: everything else either picks a
policy, fixes a decision the core already implements, or works beside it.
The immediate call form is eager — it starts when you call it. The curried form
(`series(fn, opts)`) builds the reusable run and starts when you apply it to
items.

### Core: iteration — `series`

Many inputs, no dependency between them: import/sync jobs, API fan-in with a
rate limit, paging generators, anything with a progress bar. `series` maps and
drops (`drop` from the mapper drops the item; `undefined` still drops in 0.18),
with progress, pacing, `take` and cancellation.

```js
import {series, collect} from 'pipelean'

const {results, errors, failure} = await series(urls, fetchJson, {
  strategy: collect,
  pause: 200,
  onProgress: ({index, total}) => setStatus(`${index + 1}/${total}`),
})
```

→ [guide](docs/guide.md#independent-vs-dependent-operations) · [reference](docs/reference.md#iterators)

### Core: accumulation — `scan` and `reduce`

Step N needs step N-1's output: you are **folding** over items. Keep every
intermediate value (`scan`) or only the last (`reduce`). Both return a report
with an explicit failure policy, and both default to `failFast`.

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |

```js
const {results} = await scan(tracks, insertAfter, 0)       // every accumulator
const {value: total} = await reduce(tracks, addDuration, 0) // the last one
```

→ [guide](docs/guide.md#which-fold) · [reference](docs/reference.md#scan)

### The error model

Errors are **data**: every iterator returns a structured result instead of
throwing, and you choose the failure policy with a strategy.

| strategy | `errors` | `failure` | stops? |
|---|---|---|---|
| `collect` | all handled errors | `false` | no |
| `failLate` | all handled errors | `{errors}` at the end | no |
| `failFast` | `[]` | `{item, error, index}` | on first error |
| `skip` | `[]` | `false` | no |
| `rethrow` | throws | — | on first error |

Defaults: `series`, `filter`, `enrich` and `join` use `collect`; `scan` and
`reduce` use `failFast`, because a half-finished fold is usually meaningless.
On `join`, `failFast` behaves as `failLate`: the branches have already started.

Three rules worth knowing up front:

- `onError` is a **callback**, not a strategy: it never changes control flow.
- `rethrow` is **raw async mode** (a bug or infrastructure failure must escape
  to the caller), not a way to extract a value. For that, use `foldSync` or
  `assertOk(result)`.
- `failFast` does not throw: it returns `failure` as data. If nobody reads the
  result, the job stops silently — `assertOk` is the guard for that footgun.

The full model — source errors, fold recovery (`recover`), callbacks, result
shapes: [guide](docs/guide.md#error-strategies) ·
[reference](docs/reference.md#error-strategies).

### Shortcuts over the core

Each shortcut is the core with one decision already made — the same engine, not
a second semantics. Use the core when you need the report or a different policy;
use the shortcut when its fixed decision is exactly what you want.

| Shortcut | It is |
|---|---|
| `filter(items, predicate)` | `series(items, x => predicate(x) ? x : drop)` — truthiness decides, and `drop` counts as falsy |
| `mapSeries(items, fn)` | `series(items, fn, {strategy: rethrow}).results` — a bare array or the original error |
| `findSync(items, predicate)` | the sync first match: `filterSync`'s decision with early exit at the match |
| `foldSync(xs, fn, initial)` | `reduceSync(xs, fn, initial, {strategy: rethrow}).value` — no report at all |
| `enrich(ops)(input)` | `reduce(ops, (state, op) => ({...state, ...op(state)}), input)` — folds the steps, not the items |

They inherit the core's options where they can honour them and reject known
options that would be dead configuration: `filter` and `findSync` read
truthiness, so neither takes `onUndefined`; `enrich` folds a fixed array in
memory, so it rejects the run lifecycle (`signal`, `pause`, `take`, …). The
full table is [Unsupported options](docs/reference.md#unsupported-options).

```js
await filter(users, where({active: true}))  // keep matches, same report shape
await mapSeries(files, parseFile)           // bare array, or the original error
const byArtist = foldSync(tracks, (acc, t) => ({...acc, [t.artist]: t}), {})
const processAlbum = enrich([prepareAlbum, extractYear, extractArtists])
```

→ [guide](docs/guide.md#accumulation-vs-enrichment) ·
[reference](docs/reference.md#enrich)

### Orthogonal tools

The rest of the library does not extend the core; it works beside it.

- **Composition & concurrency** — `pipe` chains value-in/value-out steps into
  one reusable function (`drop`, and `undefined` in 0.18, short-circuits; errors
  escape). `join` runs a handful of **named, heterogeneous** tasks at the same
  time and reports them together — it is not a concurrent map (use p-map for
  that). [guide](docs/guide.md#pipeline-composition) ·
  [reference](docs/reference.md#composition)
- **Operation tools** — `tryCatch(fn)` is the execution boundary for one
  function: hooks observe, `recover` is the only seam that substitutes, and a
  failure is rethrown by default. `retry(fn)` retries one call, then rethrows.
  Neither is an error strategy. [guide](docs/guide.md#wrappers-retry-and-trycatch)
- **Guards & helpers** — `assertOk(result)` throws when a failure would
  otherwise be ignored; `where(pattern)` builds a strict-equality predicate;
  `assign(property, parse)` builds an `enrich` step; `delay(ms)` is a plain
  wait. [reference](docs/reference.md#assertok)
- **Sources & lifecycle** — `stopWhen(items, predicate)` ends a source on a
  condition; `forever()` yields unbounded ticks for daemon loops; `signal`,
  `pause` and `take` belong to the run. See
  [patterns](docs/patterns.md#pattern-10-daemon-loop-with-forever--signal).
- **Sync mirror** — the core and most shortcuts have `*Sync` counterparts that
  return directly instead of a `Promise` (`seriesSync`, `filterSync`,
  `mapSeriesSync`, `scanSync`, `reduceSync`, `pipeSync`, `enrichSync`), plus the
  source adapters; `findSync` and `foldSync` are sync-only. They reject async
  iterables, async-only options (`signal`, `pause`, `pauseOnErrors`) and
  callbacks that return thenables. [Sync variants](docs/reference.md#sync-variants).

```js
const normalize = pipe(user => user.active ? user : drop, user => user.email)
const {value, errors} = await join({ping: () => pingHost(host), scan: () => scanPort(host, 443)})
```

Full contracts: [reference](docs/reference.md#how-to-choose).

## Limitations

Worth knowing before you adopt it:

- **Eager execution.** The immediate form starts work when you call it; the
  curried form builds a reusable run. There are no lazy pipelines.
- **Sequential by design.** The only concurrency is `join`: no cap, no
  scheduler, no cancellation.
- **Cancellation stops between items.** `signal` never interrupts an in-flight
  mapper; keep intra-item cancellation in your own operation.
- **`drop` is the drop sentinel**, so you cannot map an item to `drop` — also
  in `mapSeries`, which is not `Array.prototype.map`. In 0.18 `undefined` still
  drops too; that legacy default will flip in 1.0. `series` and `mapSeries`
  accept `onUndefined: 'error'` to make `undefined` fatal today; see the
  [migration notes](docs/migration.md).
- **Error tools are not layers.** Strategies own the run's policy; the fold
  `recover` option is the fold-local seam (`tryCatch` has its own
  single-operation `recover`); `retry`/`tryCatch` wrap one function; `assertOk`
  guards a finished result.
- **No TypeScript declarations yet.**
- **Not a stream adapter.** Anything `for await` accepts works; Node
  `ReadableStream` glue is yours.

## Tooling

### ESLint plugin

Flags `.forEach()`, `.reduce()`, `.map(async ...)`, non-generator loops,
`Promise.*` combinators and async callbacks passed to `*Sync` combinators,
suggesting pipelean equivalents:

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [
  pipeleanConfig,
  {
    rules: {
      'pipelean/no-loop-without-yield': 'warn',
      'pipelean/no-promise-combinators': 'warn',
    },
  },
]
```

Rules, the `no-fold-rethrow` codemod suggestion and its limits:
[docs/eslint.md](docs/eslint.md).

### Agent skills

Pipelean ships an **Agent Skill** for AI assistants (Claude, Gemini CLI, Cursor,
OpenCode, …):

```sh
npx skills add https://github.com/ildella/pipelean/tree/master/skills -g -y
```

`-g` installs it globally (user-level, available in every project) and `-y`
skips the prompts. Skills are symlinked into each detected agent by default; add
`--copy` to copy files instead. Drop `-g` to install it into the current project
only.

With [skills-npm](https://github.com/antfu/skills-npm/): `yarn add -D skills-npm
&& yarn skills-npm`.

## Next

- [Guide](docs/guide.md) — learn the mental model, concept by concept.
- [Reference](docs/reference.md) — full API contracts, for lookup.
- [Examples](docs/examples.md) — practical examples for every function.
- [Patterns](docs/patterns.md) — error-handling recipes, daemon loops.
- [ESLint plugin](docs/eslint.md) — rules and setup.
- [FP mapping](docs/fp-mapping.md) — coming from Elixir, Scala/cats or Haskell.
- [Alternatives](docs/alternatives.md) — when to reach for p-map, RxJS, exstream-js.
- [Architecture](docs/architecture.md) — philosophy and design principles.
- [Migration](docs/migration.md) — upgrading from earlier versions.
