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

- `series` & `scan` for horizontal flows (independent or stateful steps)
- `pipe` for vertical composition
- `tryCatch` and `retry` middleware you can reuse across your app
- Built-in error strategies with sensible defaults for each operation
- Structured results and progress hooks — no silent crashes

## The alternatives

Need parallel? → p-map
Want lazy iterators? → iter-tools
Love reactive streams? → RxJS / most.js

We believe Pipelean is a pragmatic middle path: sequential by design, with built-in error control and resiliency — so you stop rewriting the same boilerplate every time.

## ESLint Plugin

Pipelean ships a small ESLint plugin that flags `.forEach()` and `.reduce()` and suggests the pipelean equivalents. It is a separate entry point — importing it does not pull in the runtime library.

```js
import pipeleanPlugin from 'pipelean/eslint'

export default [
  {
    plugins: { pipelean: pipeleanPlugin },
    rules: {
      'pipelean/no-array-foreach': 'warn', // suggests series()
      'pipelean/no-array-reduce': 'warn',  // suggests scan()
    },
  },
]
```

## AI & Agentic Development

Pipelean is "Agent-Ready." It ships with built-in **Skills** and an **Agent Persona** to help AI assistants (like Claude, Gemini CLI, or Cursor) write better code using this library.

### 1. Install Skills

```sh
npx skills add ildella/pipelean@core
npx skills add ildella/pipelean@fp-standards
```

### 2. Use the Agent Persona
The repository includes \`pipelean-agent.md\`, a model-agnostic system prompt. You can use it to initialize a "Pipelean Architect" session in your favorite AI CLI:

```sh
gemini -p pipelean-agent.md
```

## Documentation

  * [Architecture](docs/architecture.md) : The philosophy and design principles.
  * [Guide](docs/guide.md) : Core concepts and usage patterns.
  * [Examples](docs/examples.md) - Practical usage examples for all functions
  * [Reference](docs/reference.md) - Reference docs

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
