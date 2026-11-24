# Pipelean

Sequential iteration and accumulation with explicit error handling.

Pipelean gives a clear contract to sequential operations: how items are processed, how state accumulates, and what happens when an operation fails. No hand-written loops, accidental error handling, or hidden failure policies.

Plain JavaScript. Eager execution. No framework or scheduler.

## Why Pipelean?

Sequential operations often require the same boilerplate: iterate over items, accumulate a value when needed, and decide what happens when an operation fails.

Pipelean makes these three concerns explicit, composable, and reusable.

```js
import {series, collect} from 'pipelean'

const {results, errors} = await series(pages, importPage, {
  strategy: collect,
  onError: ({item, error}) => log.warn(item, error),
})

if (errors.length) report(errors)
```

Process items sequentially, collect failures without losing successful results, and choose the error policy instead of burying it in a loop.

## Install

```sh
npm install pipelean
```

Node.js >= 22.7. ESM.

## The core

Pipelean is built around three concepts.

### 1. Iteration

Process a sequence of independent items, one at a time.

| Function | Purpose |
| --- | --- |
| `series` | Process items, collect results and handle failures through a strategy |
| `filter` | Select items using a predicate |
| `mapSeries` | Sequential map that throws on the first failure and returns a plain array |

`series` and `filter` support arrays, generators, and async iterables. They can process synchronous or asynchronous callbacks.

```js
const {results, errors} = await series(items, processItem)
```

Returning `undefined` from a mapper drops the item.

`mapSeries` is a convenience API with a fixed `rethrow` policy. It returns a plain array or throws the original error.

### 2. Accumulation

When each item depends on the result of the previous one, use a fold.

| Function | Keeps | Returns |
| --- | --- | --- |
| `scan` | Every intermediate accumulator | Report with `results` |
| `reduce` | Final accumulator only | Report with `value` |
| `foldSync` | Final accumulator only | Raw value |

```js
const {value: total} = await reduce(
  tracks,
  (sum, track) => sum + track.duration,
  0,
)
```

Use `scan` when intermediate states matter, `reduce` when only the final state matters, and `foldSync` for a synchronous fold where errors should throw directly.

### 3. Error strategies

Errors are handled according to an explicit strategy. Strategies determine whether execution continues, stops, or throws.

| Strategy | Behavior |
| --- | --- |
| `collect` | Continue and collect errors in `errors` |
| `failLate` | Continue, then report failure after processing |
| `failFast` | Stop on the first error and return it as `failure` |
| `skip` | Continue without collecting errors |
| `rethrow` | Throw the original error immediately |

`onError` is an observation hook, not an error strategy.

Default strategies:

- `series`, `filter`, and `enrich`: `collect`
- `scan` and `reduce`: `failFast`

Results make handled failures explicit. Use `assertOk(result)` when a failure must not be ignored.

See [the error model in the Guide](docs/guide.md) for result shapes, source errors, recovery, and strategy details.

## Additional tools

These complement the core. You don't need them to get started.

### Pipeline composition

- `pipe` — compose value-in/value-out functions into a reusable pipeline.
- `enrich` — accumulate object patches over one input.
- `assign` — build conditional property-assignment steps for `enrich`.
- `join` — run a small set of named tasks concurrently and return a structured result.

### Convenience APIs

- `mapSeries` / `mapSeriesSync` — sequential mapping with errors thrown rather than reported.
- Sync counterparts — `seriesSync`, `filterSync`, `scanSync`, `reduceSync`, `findSync`, `stopWhenSync`, `pipeSync`, `enrichSync`, and `tryCatchSync`. They return directly and reject async-only behavior.

### Advanced controls

- `retry` — retry a function after failure.
- `stopWhen` — stop an iterable when a predicate matches.
- `forever` — produce an unbounded sequence of ticks.
- `signal` — cancel a run between items.
- `pause` / `pauseOnErrors` — control execution pacing.
- `recover` — recover a failed fold and continue accumulation.

### Standalone utilities

These are useful outside iteration and accumulation:

- `tryCatch` — wrap a function with error handling and lifecycle hooks.
- `assertOk` — ensure a Pipelean result did not fail.
- `where` / `findSync` — predicate helpers and synchronous search.

## What Pipelean is not

- Not concurrent mapping. Iteration and accumulation are sequential. `join` is for a small set of heterogeneous tasks, not a concurrent collection.
- Not lazy. Execution starts immediately.
- Not a stream adapter. Any iterable or async iterable is supported; Node streams need their own adapter.
- Not a replacement for simple native JavaScript. If a plain `map`, `filter`, `await`, or `try/catch` is clearer, use it.

## Documentation

- [Guide](docs/guide.md) — understand the mental model and how to choose the right operation.
- [Reference](docs/reference.md) — API signatures, options, return shapes, and exact contracts.
- [Examples](docs/examples.md) — practical usage.
- [Patterns](docs/patterns.md) — recipes for common problems.
- [ESLint plugin](docs/eslint.md) — lint rules and suggestions.
- [Architecture](docs/architecture.md) — design principles.
- [Migration](docs/migration.md) — upgrading between versions.

## ESLint

Pipelean includes an ESLint plugin that encourages explicit sequential processing and discourages common async mistakes.

```js
import pipeleanConfig from 'pipelean/eslint/config'

export default [pipeleanConfig]
```

See the [ESLint documentation](docs/eslint.md) for configuration and individual rules.

## Agent Skill

Pipelean includes an Agent Skill for AI coding assistants.

```sh
npx skills add https://github.com/ildella/pipelean/tree/master/skills -g -y
```

See the repository's `skills` directory for details.

## License

MIT
