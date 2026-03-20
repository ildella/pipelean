# Pipelean

[![npm version](https://img.shields.io/npm/v/pipelean.svg)](https://www.npmjs.com/package/pipelean)
[![Build Status](https://github.com/ildella/pipelean/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ildella/pipelean/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Sequential async pipelines with **first-class retry, error boundaries, and smart failure strategies**. Pragmatic, direct, no heavy abstractions. 

Just plain JavaScript. Eager execution. Perfect stack traces.


```js
const result = await series([
  () => fetchUser(id),
  user  => validateAndEnrich(user),
  final => saveToDatabase(final),
  saved => sendWebhook(saved),
], { strategy: collect });   // or failFast, retry(3), custom...
```

## Why Pipelean?

Stop writing the same try/catch and manual accumulation boilerplate.

Pipelean gives you:

- `series` & `scan` for horizontal flows (independent or stateful steps)
- `pipe` for vertical composition
- `retry` + `tryCatch` middleware you can reuse across your app
- Built-in error strategies (`collect` all errors or `fail-fast`) with sensible defaults
- Structured results and progress hooks — no messy arrays, no silent crashes

## The alternatives

Need parallel? → p-map
Want lazy iterators? → iter-tools
Love reactive streams? → RxJS / most.js

We believe Pipelean is a pragmatic middle path: sequential by design, with built-in error control and resiliency — so you stop rewriting the same boilerplate every time.

## Documentation

  * [Architecture](docs/architecture.md) : The philosophy and design principles.
  * [Guide](docs/guide.md) : Core concepts and usage patterns.
  + [Examples](../examples.md) - Practical usage examples for all functions
  + [Reference](docs/reference.md) - Reference docs

## Example

```js
import { pipe, series } from 'pipelean'

const downloadSomething = async () => {...}
const transformSomething = () => {...}
const writeToDatabase = async () => {...}

const pipeline = await pipe(
  downloadSomething,
  transformSomething,
  writeToDatabase,
)

const {results, errors} = series(pipeline, {
  strategy: 'failFast',
})
```
