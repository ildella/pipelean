# Pipelean Reference Documentation

**Overview**

`functional.js` is an async programming library that provides core utilities for handling asynchronous operations, error management, data transformations, and functional composition patterns in JavaScript. The library is designed with a pragmatic philosophy: avoid heavy abstractions, use eager execution, and provide clear, predictable error handling.

**Key Principles**

- **Pragmatic**: Plain JavaScript, eager execution, sequential processing.
- **First class error handling**: Multiple error strategies for different use cases

---

## Table of Contents

### Error strategies

- [failFast](#failfast) - Error Strategy Identifier (aliases: `stopOnError`, `fail`)
- [rethrow](#rethrow) - Error Strategy Identifier (throws on first error)
- [failLate](#faillate) - Error Strategy Identifier
- [collect](#collect) - Error Strategy Identifier
- [skip](#skip) - Error Strategy Identifier
- [Callbacks](#callbacks) - Error handling callbacks

### Iterators

**Horizontal**

- [series](#series) - Stateless Sequential Execution
- [scan](#scan) - Stateful Sequential Transformation
- [filter](#filter) - Stateless Selection

### Composition

- [pipe](#pipe) - Vertical Composition
- [flow](#flow) - Stateful Accumulation Across One Input

### Misc

- [retry](#retry) - Configurable Retry Logic
- [tryCatch](#trycatch) - Single Function Lifecycle Hooks

### Sync Variants

- [Sync Functions](#sync-functions) - Synchronous counterparts for synchronous code

---

## Error strategies

### failFast

**Purpose**: Error strategy identifier that stops immediately on the first error.

**Alias**: `stopOnError`

**Use when**: Critical operations where failure means the entire pipeline is invalid.

**Behavior**:
- Sets `failure: {item, error, index}` on first error
- Calls `onError({item, error, index, total})`, then `onFailure({item, error, index})` immediately
- Stops iteration

**Return Format**: `{results: [], errors: [], failure: {item, error, index}}`

**Example**:
```javascript
import {series, failFast} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: failFast})

// result = {results: [], errors: [], failure: {item: 2, error: Error(...), index: 1}}
```

---

### rethrow

**Purpose**: Error strategy identifier that throws the error immediately on the first failure. Does NOT return a structured result on failure.

**Use when**: "Let it crash" / fail-early patterns where the caller is expected to handle errors externally (e.g. via try/catch).

**Behavior**:
- Throws the error on first failure
- Does NOT call `onFailure`
- Does NOT call `onError` in `series`

**Return Format**: On success: `{results, errors: [], failure: false}`

**Example**:
```javascript
import {series, rethrow} from 'pipelean'

try {
  const result = await series([1, 2, 3], async item => {
    if (item === 2) throw new Error('Error')
    return item * 2
  }, {strategy: rethrow})
} catch (error) {
  // error = Error('Error')
}
```

---

### collect

**Purpose**: Error strategy identifier that collects all errors and continues processing (default for `series` and `filter`).

**Use when**: Batch operations, logging scenarios, background tasks.

**Behavior**:
- Collects all errors in `errors` array
- Sets `failure: false`
- Does NOT call `onFailure`

**Return Format**: `{results, errors: [{item, error, index}], failure: false}`

**Example**:
```javascript
import {series, collect} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2 || item === 4) throw new Error('Error')
  return item * 2
}, {strategy: collect})

// result = {results: [2, 6], errors: [{item: 2, error: ..., index: 1}], failure: false}
```
---

### failLate

**Purpose**: Error strategy identifier that collects all errors and returns `failure: {errors}` at the end.

**Use when**: Application-layer needs to detect if *any* error occurred.

**Behavior**:
- Collects all errors in `errors` array
- Sets `failure: {errors}` after loop completes (only if `errors.length > 0`)
- Calls `onFailure({errors})` if `failure` is truthy

**Return Format**: `{results, errors: [{item, error, index}], failure: {errors}}` (if any errors occurred)

**Example**:
```javascript
import {series, failLate} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2 || item === 4) throw new Error('Error')
  return item * 2
}, {strategy: failLate})

// result = {results: [2, 6], errors: [{item: 2, error: ..., index: 1}], failure: {errors}}
```
---

### skip

**Purpose**: Error strategy identifier that ignores errors entirely (no collection), but `onError` is still called if present.

**Use when**: Best-effort processing, some failures are acceptable.

**Behavior**:
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: false`
- Does NOT call `onFailure`

**Return Format**: `{results, errors: [], failure: false}`

**Example**:
```javascript
import {series, skip} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: skip})

// result = {results: [2, 6], errors: [], failure: false}
```

---

## Callbacks

### onError

Optional callback for verification/telemetry (logging, metrics).

- Called for every handled item error in `series`
- Does NOT affect control flow
- Receives `{item, error, index, total}`; `total` is omitted when unknown
- Use for: logging, metrics, external error reporting

```javascript
await series(items, fn, {
  strategy: skip,
  onError: ({item, error}) => console.error('Error:', item.id, error.message)
})
```

---

### onFailure

Optional callback for application-layer error handling (UI updates, notifications).

- Called when `failure` is truthy
- Depends on strategy:
  - `failFast`: called with `{item, error, index}`
  - `failLate`: called with `{errors}`
  - `collect` / `skip`: NOT called (failure is false)

```javascript
await series(items, fn, {
  strategy: failLate,
  onFailure: (failure) => {
    if (failure.errors) {
      showToast('Some items failed')
    } else {
      showToast(`Item ${failure.item} failed: ${failure.error.message}`)
    }
  }
})
```

---

## Iterators

### series

**Purpose**: Stateless sequential execution over an iterable. Runs a function on each item, one at a time.

**Type**: `(items, fn, opts?) => Promise<Outcome>` — immediate mode
Curried: `(fn, opts?) => (items) => Promise<Outcome>`

**Parameters**:
- `items`: An iterable (array, async iterable, generator)
- `fn(item, index)`: The function to apply. Returns the mapped value, or throws, or returns `undefined` to drop the item.
- `opts` (optional):
  - `strategy`: Error strategy (default: `collect`). `failFast`, `collect`, `failLate`, `skip`, `rethrow`.
  - `onProgress({item, result, index, total})`: Called after each successful item. NOT called for errors or `undefined` drops.
  - `onError({item, error, index, total})`: Called for each handled item error. Does not affect control flow.
  - `onFailure(failure)`: Called when failure is truthy. Receives `{item, error, index}` for `failFast`, `{errors}` for `failLate`.
  - `take`: Limit items processed.
  - `total`: Explicit planned input count for progress/error callbacks. If omitted, `series` uses a cheap known input size when available. If `take` is set, callback `total` is limited to `Math.min(take, knownTotal)`. If no total is known, the `total` key is omitted.
  - `pause`: Milliseconds between successful items.
  - `pauseOnErrors`: Whether to also pause after errors (default: `false`).

**Return**: `{results, errors, failure}` where `failure` is `false` on success. Collected `errors` are `{item, error, index}`.

**Usage Example**:
```javascript
import { series, failFast } from 'pipelean'

// Basic: double each number
const { results } = await series([1, 2, 3], x => x * 2)
// results = [2, 4, 6]

// With failFast: stop on first error
const result = await series(items, fn, { strategy: failFast })

// With pause for rate limiting
const result = await series(endpoints, fn, { pause: 500 })

// With UI progress
await series(items, saveItem, {
  onProgress: ({index, total}) => updateProgress(index + 1, total),
  onError: ({item, error}) => reportItemError(item.id, error),
})

// Curried: create a reusable transform
const double = series(x => x * 2)
const { results } = await double([1, 2, 3])

// Integration with pipe for filtering
import { pipe } from 'pipelean'
const { results } = await series(items, pipe(
  x => x.active ? x : undefined,  // drop inactive
  x => x.name,                     // extract name
))
```

---

### scan

**Purpose**: Stateful sequential transformation - transforms each item and accumulates results.

**Type**: `(iterable, scanner, initialValue) => scanFunction`

**Parameters**:
- `iterable`: An async iterable (array, generator, or any object implementing the iteration protocol)
- `scanner`: A function with signature `(accumulator, item, index) => newAccumulator`
- `initialValue`: The starting value for the accumulator

**Return Type**: A Promise that resolves to an object containing:
- `results`: Array of intermediate results (or `[]` on failFast failure)
- `errors`: Array of errors encountered (empty for failFast, skip, throw)
- `failure`: `false` on success; `{item, error, index}` for failFast; `{errors}` for failLate
- `value`: Final accumulated value when `storePartialResults: false` (only on success)

**Key Characteristics**:
- **Stateful**: Each transformation depends on the previous result
- **Accumulates**: Both successful results and errors for inspection
- **Index Tracking**: Provides index of each item for correlation

**Usage Example**:
```javascript
import { scan } from './functional.js'

// Track insertions in a database
const { results, errors } = await scan(
  records,
  async (acc, record) => {
    const inserted = await db.insert(record)
    return acc + inserted  // Accumulate count
  },
  0  // Initial count
)
```

---

### reduce

**Purpose**: Pure reduction - transforms each item sequentially and returns only the final accumulated value. A convenience wrapper around `scan` with `storePartialResults: false` baked in.

**Type**: `(iterable, scanner, initialValue, opts?) => Promise<Outcome>`

**Parameters**:
- `iterable`: An async iterable (array, generator, or any object implementing the iteration protocol)
- `scanner`: A function with signature `(accumulator, item, index) => newAccumulator`
- `initialValue`: The starting value for the accumulator
- `opts` (optional):
  - `strategy`: Error strategy (default: `failFast`). `failFast`, `failLate`, `skip`, `rethrow`.
  - `onError`: Called for each handled item error. Does not affect control flow.
  - `onFailure`: Called when failure is truthy.

**Return Type**: A Promise that resolves to an object containing:
- `value`: The final accumulated value (on success). `undefined` on failFast failure.
- `errors`: Array of errors encountered (empty for failFast, skip, throw)
- `failure`: `false` on success; `{item, error, index}` for failFast; `{errors}` for failLate

**Key Characteristics**:
- **Single value**: Returns `{value, errors, failure}` instead of intermediate results
- **No boilerplate**: No need for `results.at(-1) || 0` — the final value is direct
- **Error handling**: Same error strategies as `scan` and `series`

**Usage Example**:
```javascript
import { reduce } from 'pipelean'

// Sum track durations into album total
const {value: totalDuration} = await reduce(
  tracks,
  (accumulator, {duration}) => accumulator + duration,
  0,
)
// totalDuration = 22 (no intermediate array, no .at(-1))
```

**When to use**:
- Summing, counting, concatenating
- Any reduction where you only need the final result
- When `scan`'s intermediate results array is unnecessary overhead

**When to use `scan` instead**:
- When you need every intermediate accumulator value (e.g. dependent sequential operations where each step's output is meaningful)

**Alias**: `scanReduce` is kept as an alias of `reduce` for backward compatibility and points to the same function.

---

### filter

**Purpose**: Stateless selection tool - filters items from an iterable based on a predicate function. Delegates to `series` internally: the predicate is converted to a transform that returns the original item (keep) or `undefined` (drop).

**Type**: `(...args) => Promise<Outcome> | filterFunction`

**Parameters**:
- `predicate`: A function `(item, index) => truthy | falsy`, or a plain object pattern (converted via `where()`)
- `items`: The iterable to filter (immediate mode)
- `opts` (optional): Options passed through to `series`

**Options**: Same as `series` — `strategy`, `onError`, `onFailure`, `take`, `total`, `onProgress`, `pause`, `pauseOnErrors`.

**Return Type**: `{ results, errors, failure }` — same shape as `series`:
- `results`: Original items where the predicate returned truthy
- `failure`: `false` on success (no errors), `{item, error, index}` for `failFast`, `{errors}` for `failLate`

**Key Characteristics**:
- The predicate's return value is never placed into `results` — only truthiness is checked, and the original `item` is what gets kept or dropped.
- Pattern objects are supported: `filter(users, {active: true})` works via `where()`.

**Usage Example**:
```javascript
import { filter } from 'pipelean'

const adults = await filter(
  users,
  user => user.age >= 18,
)
// result.results = [user1, user3, ...] — original items, not predicate output
```

---

## Composition

### pipe

**Purpose**: Pipelean operation composer - chains functions left-to-right and preserves Pipelean's `undefined` drop signal.

**Type**: `(...fns) => (input) => Promise<ReturnType<LastFn>>`

**Parameters**:
- Variadic arguments: Any number of sync or async functions to execute sequentially
- `input`: The initial value passed to the first function

**Return Type**: A Promise that resolves to the final result.

**Key Characteristics**:
- Functions execute **left-to-right** (first argument is applied to `input`)
- Output of one function becomes input to the next
- Supports both synchronous and asynchronous functions
- Natural data flow from input through transformations
- Designed for composing reusable operations passed to `series()` or used directly
- **Undefined Short-Circuit**: If any step returns `undefined`, remaining steps are skipped and `undefined` is returned. This enables selection within a composed operation — see [series](#series) drop behavior.

**Usage Example**:
```javascript
import { pipe } from './functional.js'

const normalizeUser = pipe(
  async id => validateUserId(id),
  async id => fetchUser(id),
  user => user.active ? user : undefined,
  user => ({...user, email: user.email.toLowerCase()}),
)

const user = await normalizeUser(userId)

// Compose operations in a readable pipeline
const result = await pipe(
  async data => validate(data),
  async data => transform(data),
  async data => persist(data),
)(input)
```

**Best Practice**: Use `pipe()` when you need to chain operations that form a coherent data processing pipeline.

**Selection in pipe** (via undefined short-circuit):
```javascript
import { pipe, series } from 'pipelean'

// Merge filter and transform in a single operation
const result = await series(items, pipe(
  x => x.active ? x : undefined,  // drop inactive items
  x => x.name,                     // extract name
))
// Items where active is false are skipped entirely
```

---

### flow

**Purpose**: Sequentially apply multiple state-enrichment operations to one accumulated value. Each successful operation returns an object patch. Errors are handled per operation using Pipelean strategies.

**Type**: `(operations, options?) => (initialState) => Promise<{value, errors, failure}>`

**Parameters**:
- `operations`: An array of functions. Each function `operation(state)` must return a non-null, non-array object (the patch to merge into the state). Operations can be sync or async.
- `options` (optional):
  - `strategy`: Error strategy (default: `collect`). `failFast`, `collect`, `failLate`, `skip`, `rethrow`.
  - `onError({operation, error, index, total})`: Called for each handled operation error. Receives a normalized shape where `operation` is the function's `name` (or `operation-${index}` for anonymous functions) and `total` is the operation count.
  - `onFailure(failure)`: Called when `failure` is truthy. Receives `{operation, error, index}` for `failFast` and `{errors}` for `failLate` — both normalized.

**Return**: A function `(initialState) => Promise<{value, errors, failure}>`.

The returned function:
- Validates `initialState` (non-null, non-array object) and throws `TypeError` otherwise.
- Executes each operation in order, passing the **current accumulated state** to each one.
- Shallow-merges the returned patch into the state.
- Treats an invalid operation return (null, array, primitive) as that operation throwing a `TypeError`, so the selected strategy applies.
- Returns `{value, errors, failure}` where:
  - `value`: The final accumulated state. Even under `failFast`, this is the last successful accumulated state.
  - `errors`: Array of `{operation, error, index}` (normalized). Empty for `skip` and `failFast`.
  - `failure`: `false` for `collect` and `skip`; `{operation, error, index}` for `failFast`; `{errors}` for `failLate`. For `rethrow`, the original error is thrown instead of returning a result.

**Key Characteristics**:
- **Stateful accumulation**: Each operation enriches the same state object. Output of one operation becomes the input to the next.
- **Shallow merge**: `{...state, ...patch}` — top-level keys are overwritten, nested objects are not deep-merged.
- **Reusable pipeline**: The pipeline is defined once. The returned function is called with different inputs.
- **Same error strategies as `series` / `scan`**: All four strategies work, with the same `onError` / `onFailure` semantics. Default is `collect`.
- **No intermediate states**: Only the final accumulated value is returned. There is no `results` array.
- **Empty operations array** is valid and returns the initial state untouched.

**Usage Example**:
```javascript
import { flow, collect, failFast } from 'pipelean'

const prepareAlbum = state => ({title: state.rawTitle.trim()})
const extractYear = state => ({year: parseYear(state.rawYear)})
const extractArtists = state => ({artists: state.artists ?? []})

const processAlbum = flow([
  prepareAlbum,
  extractYear,
  extractArtists,
])

const {value, errors, failure} = await processAlbum(input)
// value = {title, year, artists, rawTitle, rawYear, ...input}

// Strategy choice: stop on first failure
const result = await processAlbum(input, {strategy: failFast})

// Telemetry: normalized error context
await processAlbum(input, {
  onError: ({operation, error, index, total}) =>
    logger.error({operation, error, index, total}),
})

// Reuse the same pipeline with different inputs
const album1 = await processAlbum(rawAlbum1)
const album2 = await processAlbum(rawAlbum2)
```

**When to use `flow()` vs `pipe()` vs `series()`**:
- `flow()`: One input, many enrichments, final accumulated value. Stateful across the pipeline.
- `pipe()`: Value-in / value-out composition. Each step transforms the previous step's return value. Stateless. Composable into `series()` and `flow()`.
- `series()`: Many inputs, one operation per input. Horizontal.

**Error callback payload** (always normalized):
- `onError({operation, error, index, total})` — `operation` is the function's `name` if set, otherwise `operation-${index}`. `total` is the operations array length.
- `onFailure({operation, error, index})` for `failFast`.
- `onFailure({errors})` for `failLate`, where each entry is `{operation, error, index}`.

---

## Misc

### where

**Purpose**: Creates a predicate function for strict equality object matching. Primarily used with `filter` for pattern-based selection.

**Type**: `(pattern) => (item) => boolean`

**Parameters**:
- `pattern`: A plain object with key-value pairs to match against.

**Return Type**: A predicate function.

**Usage Example**:
```javascript
import { where, filter } from 'pipelean'

const isAdmin = where({role: 'admin'})
const admins = await filter(users, isAdmin)

// Or use pattern directly with filter
const adults = await filter(users, {active: true})
```

### retry

**Purpose**: Retry async functions with configurable attempts and delays between attempts.

**Type**: `(fn, options) => retryFunction`

**Parameters**:
- `fn`: The async function to retry (required)
- `options`: Configuration object with the following properties:
  - `attempts`: `number` (default: `3`) - Number of retry attempts
  - `delay`: `number` (default: `0`) - Delay between retry attempts in milliseconds

**Behavior**:
- Retries on each attempt until successful or exhausted
- Throws the last error after exhausting all attempts
- No delay before first attempt
- Applies configured delay between subsequent attempts

**Usage Example**:
```javascript
import { retry } from './functional.js'

// Retry with default 3 attempts and 500ms delay
const result = await retry(
  async flakyOperation() => {
    return Math.random() > 0.5 // Simulate 50% failure rate
  },
  {
    attempts: 5,
    delay: 1000
  }
)
```

---

### tryCatch

**Purpose**: Wraps individual async functions with lifecycle hooks for comprehensive error handling and telemetry. Always catches errors — returns `null` on failure.

**Type**: `(fn, options) => wrapperFunction`

**Parameters**:
- `fn`: The async function to wrap
- `options`: Configuration object with the following properties:
  - `onStart: () => void` — Called before function execution (no arguments)
  - `onSuccess: (result) => void | Promise<void>` — Called on successful completion (result only)
  - `onError: (error) => void` — Called on error (error only)
  - `onFinally: () => void` — Called regardless of success/failure (no arguments)

**Return Type**: Returns a wrapper function with the same signature as `fn`. Returns `null` on error.

**Features**:
- Automatic `async/await` wrapping
- Preserves original function signature
- Comprehensive lifecycle: onStart → onSuccess/onError → onFinally
- Deep telemetry support for debugging

**Usage Example**:
```javascript
import { tryCatch } from 'pipelean'

const safeFetch = tryCatch(
  async (url) => {
    const response = await fetch(url)
    return await response.json()
  },
  {
    onError: (error) => {
      console.error('Fetch failed:', error)
    }
  }
)

const data = await safeFetch('https://api.example.com')
// data is the parsed JSON on success, null on error
```

---

## Sync Functions

`seriesSync`, `filterSync`, `findSync`, `scanSync`, `reduceSync`, `pipeSync`,
`flowSync`, and `tryCatchSync` are synchronous counterparts of the core
functions.

They use the same error strategies and structured return conventions as the
async iteration functions, but return values directly instead of wrapped in a
Promise. Use them when your data and operations are synchronous and you still
want Pipelean's structured error collection.

**Available sync variants**:

- `seriesSync` returns `{results, errors, failure}` directly
- `filterSync` returns `{results, errors, failure}` directly
- `findSync` returns `{result, errors, failure}` directly and stops at the first match
- `scanSync` returns `{results, errors, failure}` directly
- `reduceSync` returns `{value, errors, failure}` directly
- `pipeSync` composes synchronous functions left-to-right
- `flowSync` returns `{value, errors, failure}` directly and runs a state-enrichment pipeline synchronously
- `tryCatchSync` wraps a synchronous function with lifecycle hooks

> `scanReduceSync` is kept as an alias of `reduceSync` for backward compatibility.

**Not supported in sync variants**:

- `pause` and `pauseOnErrors`, because they depend on async `delay()`
- async iterables, because sync variants use plain synchronous iteration

**Usage Example**:

```javascript
import { seriesSync, collect } from 'pipelean'

const {results, errors, failure} = seriesSync([1, 2, 3], x => {
  if (x === 2)
    throw new Error('bang')
  return x * 10
}, {strategy: collect})

// results: [10, 30]
// errors: [{item: 2, error: Error('bang'), index: 1}]
// failure: false
```

**Early-exit selection with `findSync`**:

```javascript
import { findSync } from 'pipelean'

const users = [
  {id: 1, active: false},
  {id: 2, active: true},
  {id: 3, active: true},
]

const {result, errors, failure} = findSync(users, {active: true})

// result: {id: 2, active: true}
// errors: []
// failure: false
```

`findSync` supports the same predicate forms as `filterSync`, including object
patterns via `where()`. It exits as soon as the first match is found. When no
item matches, it returns `{result: undefined, errors: [], failure: false}`.

**Synchronous state enrichment with `flowSync`**:

```javascript
import { flowSync, collect } from 'pipelean'

const processAlbumSync = flowSync([
  state => ({title: state.rawTitle.trim()}),
  state => ({year: parseYear(state.rawYear)}),
])

const {value, errors, failure} = processAlbumSync(input)
// value: the shallow-merged final state
// errors: []
// failure: false
```

`flowSync` mirrors `flow()` exactly but executes synchronously. Same
strategies, same `onError` / `onFailure` semantics, same normalized error
shapes. Use it when your operations and inputs are synchronous.

---

## Related Documentation

- **[README.md](../README.md)** - Project overview and philosophy
- **[guide.md](../guide.md)** - Comprehensive development guide with examples
- **[examples.md](../examples.md)** - Practical usage examples for all functions
