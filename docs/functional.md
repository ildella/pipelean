# Pipelean Reference Documentation

**Overview**

`functional.js` is an async programming library that provides core utilities for handling asynchronous operations, error management, data transformations, and functional composition patterns in JavaScript. The library is designed with a pragmatic philosophy: avoid heavy abstractions, use eager execution, and provide clear, predictable error handling.

**Key Principles**

- **Pragmatic**: Plain JavaScript, eager execution, sequential processing.
- **First class error handling**: Multiple error strategies for different use cases

---

## Table of Contents

### Error strategies

- [failFast](#failfast) - Error Strategy Identifier
- [fail](#fail) - Error Strategy Alias
- [collect](#collect) - Error Strategy Identifier
- [failLate](#faillate) - Error Strategy Identifier
- [skip](#skip) - Error Strategy Identifier
- [stopOnError](#stoponerror) - Error Strategy Alias

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

**Purpose**: Error strategy identifier used throughout the library to indicate immediate failure without partial results.

**Type**: `Object`

```javascript
export const failFast = Object.freeze({name: 'failFast'})
```

**Usage**: Passed as the `strategy` parameter to iteration functions. Stops immediately on first error and returns a structured failure object containing the failed item and error.

---

### fail

**Purpose**: Alias for `failFast` error strategy.

**Type**: `Object`

```javascript
export const fail = Object.freeze({name: 'failFast'})
```

**Usage**: Use as a shorthand for `failFast`.

---

### collect

**Purpose**: Error strategy identifier used throughout the library to indicate that errors should be gathered and processing should continue.

**Type**: `Object`

```javascript
export const collect = Object.freeze({name: 'collect'})
```

**Usage**: Passed as the `strategy` parameter to iteration functions to collect all errors and continue processing.

---

### failLate

**Purpose**: Error strategy identifier that collects all errors and returns `failure: true` at the end.

**Type**: `Object`

```javascript
export const failLate = Object.freeze({name: 'failLate'})
```

**Usage**: Use when the application-layer needs to detect if *any* error occurred, while still collecting all errors.

---

### skip

**Purpose**: Error strategy identifier that ignores errors entirely (no collection), but `onError` is still called if present.

**Type**: `Object`

```javascript
export const skip = Object.freeze({name: 'skip'})
```

**Usage**: Use for best-effort processing where some failures are acceptable.

---

### stopOnError

**Purpose**: Alias for `failFast` error strategy.

**Type**: `Object`

```javascript
export const stopOnError = Object.freeze({name: 'failFast'})
```

**Usage**: Use as a shorthand for `failFast` with a more descriptive name.

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

**Purpose**: Stateless selection tool - filters items from an iterable based on a predicate function.

**Type**: `(...args) => filteredItems | filterFunction`

**Parameters**:
- First argument (optional): If a function, specifies `take` and `onError` strategy
- Remaining arguments: Items to filter
- If first arg is NOT a function: Treated as `iterable` and processed with `take` strategy

**Options**:
- `strategy`: Error strategy object (`failFast`, `collect`, `failLate`, `skip`, or aliases)
- `onError`: Optional callback called for each error
- `onFailure`: Optional callback called when `failure` is truthy (failFast: `{item, error}`, failLate: `true`)
- `take`: Optional number of items to collect

**Return Type**: Returns `{ results, errors, failure }` object:
- With `failFast`: `{ results, errors: [], failure: { item, error } }`
- With `collect`: `{ results, errors: [...], failure: null }`
- With `failLate`: `{ results, errors: [...], failure: true }`
- With `skip`: `{ results, errors: [], failure: null }`

**Usage Example**:
```javascript
import { filter, failFast } from './functional.js'

// Filter valid emails from a list
const validEmails = await filter(
  async (email) => {
    return email.includes('@')
  },
  emails,
  {
    strategy: failFast  // Stop on first invalid email
  }
)
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

- **[errors.md](./errors.md)** - Complete guide to error handling strategies and callbacks
- **[README.md](../README.md)** - Project overview and philosophy
- **[guide.md](../guide.md)** - Comprehensive development guide with examples
- **[examples.md](../examples.md)** - Practical usage examples for all functions
