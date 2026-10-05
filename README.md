# Pipelean

[![npm version](https://img.shields.io/npm/v/pipelean.svg)](https://www.npmjs.com/package/pipelean)
[![Build Status](https://github.com/ildella/pipelean/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ildella/pipelean/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sequential async pipelines with **first-class retry, error boundaries, and smart failure strategies**. Pragmatic, direct, no heavy abstractions. 

Just plain JavaScript. Eager execution. Perfect stack traces.

## Why Pipelean?

To stop writing the same try/catch and manual accumulation boilerplate.

```js

## This is bad coding
for await (const item of iterable) {
  try {
    const result = await execute(item)
  } catch (error) {
    // OH BOY
    console.error(error)
  }
}

## This does not have async transformations and error control
array.filter(predicate).map(transform)
````

Pipelean gives you:

- `series` for sequential work over arrays **and async iterables** — live `onProgress`, `pause` rate limits, `take`, first-class error strategies
- `scan` / `reduce` for stateful accumulation across many items
- `flow` for stateful accumulation across one input — each operation enriches the same state
- `join` for fork/join over **named** concurrent tasks — one structured `{value, errors, failure}` outcome, errors as data per branch
- `pipe` for vertical composition
- `tryCatch` and `retry` middleware you can reuse across your app
- Structured results `{results, errors, sourceErrors, failure}` — no silent crashes
- `*Sync` variants for synchronous code — same error collection, no promises

## The alternatives

Need a concurrent map over a homogeneous collection? → p-map
Need fork/join over named, heterogeneous tasks with one structured outcome? → `join` (built in)
Want lazy iterators? → iter-tools
Love reactive streams? → RxJS / most.js

We believe Pipelean is a pragmatic middle path: sequential by design, with built-in error control and resiliency — so you stop rewriting the same boilerplate every time.

Pipelean focuses on sequential workflows: compose operations, process collections one item at a time, carry state when needed, and control failures with built-in retry and error policies. `join()` is the deliberate exception: a small fork/join over named branches, not a concurrency runtime. No scheduler, no cancellation — the branches start together and you get one structured result.

Need the full reference for `join()`? See [Fork/join: `join()`](#forkjoin-join) below and [docs/reference.md](docs/reference.md#join).

## ESLint Plugin

Pipelean ships a small ESLint plugin that flags `.forEach()`, `.reduce()`, `.map(async ...)`, non-generator loops, and `Promise.*` static combinators, suggesting pipelean equivalents. It is a separate entry point — importing it does not pull in the runtime library.

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [
  pipeleanConfig,
  // Optionally tighten individual rules:
  {
    rules: {
      'pipelean/no-loop-without-yield': 'warn',      // loops allowed only in yielding generators
      'pipelean/no-promise-combinators': 'warn',     // suggests series() / tryCatch()
    },
  },
]
```

## AI & Agentic Development

Pipelean is "Agent-Ready." It ships with built-in **Skills** to help AI assistants (like Claude, Gemini CLI, or Cursor) write better code using this library.

### 1. Install Skills

The easiest way to install the skills is using the Vercel [agent-skills](https://github.com/vercel-labs/skills) CLI:

```sh
npx skills add https://github.com/ildella/pipelean/tree/master/skills
```

This will install:
- `pipelean-core`
- `pipelean-functional-programming`

### 2. (Experimental) using [skills-npm](https://github.com/antfu/skills-npm/)

```sh
yarn add -D skills-npm
yarn skills-npm
```

## Documentation

  * [Architecture](docs/architecture.md) : The philosophy and design principles.
  * [Guide](docs/guide.md) : Core concepts and usage patterns.
  * [Examples](docs/examples.md) - Practical usage examples for all functions
  * [Reference](docs/reference.md) - Reference docs

## Example

```js
import {pipe, series, collect} from 'pipelean'

const pipeline = pipe(
  downloadSomething,
  transformSomething,
  writeToDatabase,
)

async function* pages() {
  yield* items
}

const {results, errors, sourceErrors} = await series(pages(), pipeline, {
  strategy: collect,
  pause: 200,
  onProgress: ({item, result, index, total}) => {
    updateBar(index + 1, total)
  },
})
```

`onProgress` fires live after each kept item and is awaited before the next one. `pause` rate-limits. `total` is omitted when the source has no cheap length. See [docs/patterns.md](docs/patterns.md) for paging, unknown length, and dead-source recipes.

## Stateful accumulation: `flow()`

When each step should enrich the **same** state object (one input, many enrichments, final accumulated value), use `flow()`:

```js
import { flow } from 'pipelean'

const prepareAlbum = state => ({title: state.rawTitle.trim()})
const extractYear = state => ({year: parseYear(state.rawYear)})
const extractArtists = state => ({artists: state.artists ?? []})

const processAlbum = flow([
  prepareAlbum,
  extractYear,
  extractArtists,
])

const {value, errors, failure} = await processAlbum(input)
// value = {title, year, artists, ...input}
```

`flow()` defines the operation pipeline upfront and returns a function that runs that flow against different inputs. Each operation receives the current accumulated state and must return an **object patch** that gets shallow-merged in. Errors are handled per operation using Pipelean strategies, the same as `series` and `scan`. See [docs/reference.md](docs/reference.md#flow) for the full reference.

## Fork/join: `join()`

When you have a handful of **named, heterogeneous** async tasks that should run at the same time and be reported together, use `join()`. Every branch starts immediately and `join()` waits for all of them to settle — there is no cancellation and completion order never changes the shape of the result.

```js
import { join } from 'pipelean'

const { value, errors, failure } = await join({
  ping: () => pingHost('api.example.com'),
  scan: () => scanPort('api.example.com', 443),
})

// all good:     value = {ping: <ms>, scan: <bool>}, errors = [], failure = false
// ping failed:  value = {scan: <bool>},
//               errors = [{operation: 'ping', error, index: 0}], failure = false
```

Errors are data, per branch, using the same strategies as `flow`: `collect` (default), `failLate`, `skip`, `rethrow`. `failFast` is an alias of `failLate` here, because branches already started and cannot be stopped without an `AbortSignal`. `join()` is for named branches; for a concurrent map over a homogeneous collection, use p-map. See [docs/reference.md](docs/reference.md#join) for the full reference.
