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

## Choose your operation

Pipelean has four mental models. Find the shape of your problem, then pick the
tool — you only need to know one category to start.

| Your problem | Model | Tools |
|---|---|---|
| many items, each independent | **Independent items** | `series`, `filter`, `mapSeries` |
| each item needs the previous result | **Accumulation** | `scan`, `reduce`, `foldSync` |
| one input, many steps that add fields | **Enrichment** | `enrich` |
| one value through ordered steps, or a few named tasks at once | **Composition & concurrency** | `pipe`, `join` |

### Independent items — `series`, `filter`, `mapSeries`

Many inputs, no dependency between them: import/sync jobs, API fan-in with a
rate limit, paging generators, anything with a progress bar. `series` maps and
drops (`undefined` from the mapper drops the item), `filter` selects,
`mapSeries` is the sequential map that throws on the first failure and returns
a bare array.

```js
await filter(users, where({active: true}))  // keep matches, same report shape
await mapSeries(files, parseFile)           // bare array, or the original error
```

→ [guide](docs/guide.md#independent-vs-dependent-operations) · [reference](docs/reference.md#iterators)

### Accumulation — `scan`, `reduce`, `foldSync`

Step N needs step N-1's output: you are **folding** over items. Keep every
intermediate value (`scan`) or only the last (`reduce`). Both return a report
with an explicit failure policy. A pure sync fold where a throw means a bug —
sums, counts, grouping — is `foldSync`: it returns the value directly.

|  | keep every intermediate | keep only the final |
|---|---|---|
| fold over **items** (many inputs) | `scan` | `reduce` |
| fold over **steps** (one input) | — | `enrich` |

```js
const {value: total} = await reduce(tracks, (sum, {duration}) => sum + duration, 0)
const byArtist = foldSync(tracks, (acc, t) => ({...acc, [t.artist]: t}), {})
```

→ [guide](docs/guide.md#which-fold) · [reference](docs/reference.md#scan)

### Enrichment — `enrich`

One input, many steps that each add or override fields and need to see
everything added so far: raw payload → normalised entity, request → enriched
context, form → validated model. Each step returns an object **patch**,
shallow-merged into the state. The pipeline is defined once and reused.

```js
const processAlbum = enrich([prepareAlbum, extractYear, extractArtists])
const {value, errors, failure} = await processAlbum(input)
```

`enrich` **is** a `reduce` over your operations. `assign(property, parse)`
builds steps that set a property only when the parse is not `undefined`.

→ [guide](docs/guide.md#accumulation-vs-enrichment) · [reference](docs/reference.md#enrich)

### Composition & concurrency — `pipe`, `join`

`pipe` composes value-in/value-out steps into one reusable function (it
composes into `series` mappers); `undefined` short-circuits, errors escape to
the caller. `join` runs a handful of **named, heterogeneous** tasks at the same
time and reports them together — it is not a concurrent map (use p-map for
that).

```js
const normalize = pipe(user => user.active ? user : undefined, user => user.email)
const {value, errors} = await join({ping: () => pingHost(host), scan: () => scanPort(host, 443)})
```

→ [guide](docs/guide.md#pipeline-composition) · [reference](docs/reference.md#composition)

### Around the four models

- **Sources & loops** — `stopWhen(items, predicate)` stops a source on a
  condition; `forever()` yields unbounded ticks for daemon loops; `signal`
  cancels any run cleanly between items. See
  [patterns](docs/patterns.md#pattern-10-daemon-loop-with-forever--signal).
- **Resilience wrappers** — `retry(fn)` and `tryCatch(fn)` wrap a single
  function and compose into `pipe`/`series`; they are not error strategies.
- **Guards & helpers** — `assertOk(result)` throws when a failure would
  otherwise be ignored; `where` / `findSync` search; `assign` builds `enrich`
  steps.
- **Sync variants** — synchronous counterparts of the core APIs, returning directly instead of a Promise. They reject async iterables, async-only options, and callbacks that return thenables. Each API's reference documents its specific contract.

Full contracts: [reference](docs/reference.md).

## The error model

Errors are **data**: every iterator returns a structured result instead of
throwing, and you choose the failure policy with a strategy.

| strategy | `errors` | `failure` | stops? |
|---|---|---|---|
| `collect` | all handled errors | `false` | no |
| `failLate` | all handled errors | `{errors}` at the end | no |
| `failFast` | `[]` | `{item, error, index}` | on first error |
| `skip` | `[]` | `false` | no |
| `rethrow` | throws | — | on first error |

Defaults: `series`, `filter`, `enrich`, `join` use `collect`; `scan` and
`reduce` use `failFast`, because a half-finished fold is usually meaningless.

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

## Limitations

Worth knowing before you adopt it:

- **Eager execution.** Work starts immediately; there are no lazy pipelines.
- **Sequential by design.** The only concurrency is `join`: no cap, no
  scheduler, no cancellation.
- **Cancellation stops between items.** `signal` never interrupts an in-flight
  mapper; keep intra-item cancellation in your own operation.
- **`undefined` is the drop sentinel**, so you cannot map an item to
  `undefined` — also in `mapSeries`, which is not `Array.prototype.map`.
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
- [Architecture](docs/architecture.md) — philosophy and design principles.
- [Migration](docs/migration.md) — upgrading from earlier versions.
