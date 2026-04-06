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

### Misc

- [retry](#retry) - Configurable Retry Logic
- [tryCatch](#trycatch) - Single Function Lifecycle Hooks

---

## Error strategies

### failFast

**Purpose**: Error strategy identifier that stops immediately on the first error.

**Alias**: `stopOnError`

**Use when**: Critical operations where failure means the entire pipeline is invalid.

**Behavior**:
- Sets `failure: {item, error}` on first error
- Calls `onFailure({item, error})` immediately
- Stops iteration

**Return Format**: `{results, errors: [], failure: {item, error}}`

**Example**:
```javascript
import {series, failFast} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: failFast})

// result = {results: [2], errors: [], failure: {item: 2, error: Error(...)}}
```

---

### collect

**Purpose**: Error strategy identifier that collects all errors and continues processing (default for `series` and `filter`).

**Use when**: Batch operations, logging scenarios, background tasks.

**Behavior**:
- Collects all errors in `errors` array
- Sets `failure: null`
- Does NOT call `onFailure`

**Return Format**: `{results, errors: [...], failure: null}`

**Example**:
```javascript
import {series, collect} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2 || item === 4) throw new Error('Error')
  return item * 2
}, {strategy: collect})

// result = {results: [2, 6], errors: [{item: 2, error: ...}, {item: 4, error: ...}], failure: null}
```
---

### failLate

**Purpose**: Error strategy identifier that collects all errors and returns `failure: true` at the end.

**Use when**: Application-layer needs to detect if *any* error occurred.

**Behavior**:
- Collects all errors in `errors` array
- Sets `failure: true` after loop completes (only if `errors.length > 0`)
- Calls `onFailure(true)` if `failure` is truthy

**Return Format**: `{results, errors: [...], failure: true}` (if any errors occurred)

**Example**:
```javascript
import {series, failLate} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2 || item === 4) throw new Error('Error')
  return item * 2
}, {strategy: failLate})

// result = {results: [2, 6], errors: [{item: 2, error: ...}, {item: 4, error: ...}], failure: true}
```
---

### skip

**Purpose**: Error strategy identifier that ignores errors entirely (no collection), but `onError` is still called if present.

**Use when**: Best-effort processing, some failures are acceptable.

**Behavior**:
- Ignores errors (no collection, `errors` stays empty)
- Sets `failure: null`
- Does NOT call `onFailure`

**Return Format**: `{results, errors: [], failure: null}`

**Example**:
```javascript
import {series, skip} from 'pipelean'

const result = await series([1, 2, 3], async item => {
  if (item === 2) throw new Error('Error')
  return item * 2
}, {strategy: skip})

// result = {results: [2, 6], errors: [], failure: null}
```

---

## Callbacks

### onError

Optional callback for verification/telemetry (logging, metrics).

- Called for **every** error
- Does NOT affect control flow
- Use for: logging, metrics, external error reporting

```javascript
await series(items, fn, {
  strategy: skip,
  onError: (error) => console.error('Error:', error.message) // Called for each error
})
```

---

### onFailure

Optional callback for application-layer error handling (UI updates, notifications).

- Called when `failure` is truthy
- Depends on strategy:
  - `failFast`: called with `{item, error}`
  - `failLate`: called with `true`
  - `collect` / `skip`: NOT called (failure is null)

```javascript
await series(items, fn, {
  strategy: failFast,
  onFailure: (failure) => {
    if (failure === true) {
      // failLate: show general error notification
      showToast('Some items failed')
    } else {
      // failFast: show specific error with item
      showToast(`Item ${failure.item} failed: ${failure.error.message}`)
    }
  }
})
```

---

## Iterators

### series

**Purpose**: Horizontal composition tool - executes multiple functions in sequence, passing output of one as input to the next.

**Type**: `(...fns) => (input) => Promise<ReturnType<LastFn>>`

**Parameters**:
- Variadic arguments: Any number of async functions to execute sequentially
- `input`: The initial value passed to the first function

**Return Type**: A Promise that resolves to the final result.

**Key Characteristics**:
- Functions execute **left-to-right** (first argument is applied to `input`)
- Each function receives the result of the previous function as its first argument
- Supports synchronous or asynchronous functions
- Can be nested to build complex transformation pipelines

**Options**:
- `strategy`: Error strategy object (`failFast`, `collect`, `failLate`, `skip`, or aliases)
- `onProgress`: Optional callback called after each successful item
- `onError`: Optional callback called for each error
- `onFailure`: Optional callback called when `failure` is truthy (failFast: `{item, error}`, failLate: `true`)
- `take`: Optional number of items to process
- `throttle`: Optional number of milliseconds to wait between processing each successful item
- `throttleOnErrors`: Optional boolean (default: `false`) - Whether to also throttle after errors. When `false`, only successful items trigger the delay.

**Usage Example**:
```javascript
import { series, failFast } from './functional.js'

// Transform a value through multiple steps
const result = await series(
  async (x) => x * 2,           // Step 1: Double
  async (x) => x + 10,         // Step 2: Add 10
  async (x) => x.toString(),    // Step 3: Convert to string
  42                                   // Initial value
)

// Example with async operations
const result = await series(
  async (id) => fetchUser(id),      // Get user data
  async (user, data) => updateUser(user, data), // Update user
  user.id                               // Pass ID to next step
)

// Example with throttling for rate-limited APIs
const result = await series(
  apiEndpoints,
  async endpoint => fetch(endpoint),
  { throttle: 500 }  // Wait 500ms between each successful request
)

// Example with throttling even after errors
const result = await series(
  tasks,
  async task => processTask(task),
  {
    throttle: 100,
    throttleOnErrors: true,  // Wait even if a task fails
    strategy: 'collect'
  }
)
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
- `results`: Array of all successful transformations
- `errors`: Array of errors encountered
- `failure`: The item/index where failure occurred (if scan stopped early)

**Key Characteristics**:
- **Stateful**: Each transformation depends on the previous result
- **Accumulates**: Both successful results and errors for inspection
- **Index Tracking**: Provides index of each item for correlation

**Usage Example**:
```javascript
import { scan } from './functional.js'

// Track insertions in a database
const { results, errors } = await scan(
  async records,
  async (acc, record) => {
    const inserted = await db.insert(record)
    return acc + inserted  // Accumulate count
  },
  0  // Initial count
)
```

---

### filter

**Purpose**: Stateless selection tool - filters items from an iterable based on a predicate function. Delegates to `series` internally: the predicate is converted to a transform that returns the original item (keep) or `undefined` (drop).

**Type**: `(...args) => Promise<Outcome> | filterFunction`

**Parameters**:
- `predicate`: A function `(item, index) => truthy | falsy`, or a plain object pattern (converted via `where()`)
- `items`: The iterable to filter (immediate mode)
- `opts` (optional): Options passed through to `series`

**Options**: Same as `series` — `strategy`, `onError`, `onFailure`, `take`, `onProgress`, `throttle`, `throttleOnErrors`.

**Return Type**: `{ results, errors, failure }` — same shape as `series`:
- `results`: Original items where the predicate returned truthy
- `failure`: `false` on success (no errors), `{item, error}` for `failFast`, `true` for `failLate`

**Key Characteristics**:
- The predicate's return value is never placed into `results` — only truthiness is checked, and the original `item` is what gets kept or dropped.
- Pattern objects are supported: `filter({active: true}, users)` works via `where()`.

**Usage Example**:
```javascript
import { filter } from 'pipelean'

const adults = await filter(
  user => user.age >= 18,
  users,
)
// result.results = [user1, user3, ...] — original items, not predicate output
```

---

## Composition

### pipe

**Purpose**: Vertical composition tool - chains functions left-to-right (Unix pipe pattern).

**Type**: `(...fns) => (input) => Promise<ReturnType<LastFn>>`

**Parameters**:
- Variadic arguments: Any number of async functions to execute sequentially
- `input`: The initial value passed to the first function

**Return Type**: A Promise that resolves to the final result.

**Key Characteristics**:
- Functions execute **left-to-right** (first argument is applied to `input`)
- Output of one function becomes input to the next
- Supports both synchronous and asynchronous functions
- Natural data flow from input through transformations
- **Undefined Short-Circuit**: If any step returns `undefined`, remaining steps are skipped and `undefined` is returned. This enables selection (filtering) within a composed pipe — see [series](#series) drop behavior.

**Usage Example**:
```javascript
import { pipe } from './functional.js'

// Process user through validation, transformation, and storage
const userId = await pipe(
  async (id) => validateUserId(id),    // Step 1
  async (id) => fetchUser(id),              // Step 2
  async (user, data) => saveUser(user, data), // Step 3
  userId                                   // Starting value
)

// Compose operations in a readable pipeline
const result = await pipe(
  async (data) => validate(data),
  async (data) => transform(data),
  async (data) => persist(data),
  null  // No initial data needed
)
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

## Misc

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

**Purpose**: Wraps individual async functions with lifecycle hooks for comprehensive error handling and telemetry.

**Type**: `(fn, options) => wrapperFunction`

**Parameters**:
- `fn`: The async function to wrap
- `options`: Configuration object with the following properties:
  - `onStart`: `(fn, args) => void` - Called before function execution
  - `onSuccess`: `(fn, args, result) => void | Promise<void>` - Called on successful completion
  - `onError`: `(fn, args, error) => void` - Called on error
  - `onFinally`: `(fn, args) => void` - Called regardless of success/failure
  - `rethrow`: `boolean` (default: `false`) - Whether to rethrow errors after handling

**Return Type**: Returns a wrapper function with the same signature as `fn`.

**Features**:
- Automatic `async/await` wrapping
- Preserves original function signature
- Comprehensive lifecycle: onStart → onSuccess/onError → onFinally
- Optional rethrow for error propagation
- Deep telemetry support for debugging

**Usage Example**:
```javascript
import { tryCatch } from './functional.js'

// Example: Try/catch mode
const safeFetch = tryCatch(
  async (url) => {
    const response = await fetch(url)
    return await response.json()
  },
  {
    onError: async (error) => {
      console.error('Fetch failed:', error)
    }
  }
)
```

---

## Related Documentation

- **[README.md](../README.md)** - Project overview and philosophy
- **[guide.md](../guide.md)** - Comprehensive development guide with examples
- **[examples.md](../examples.md)** - Practical usage examples for all functions
