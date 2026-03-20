# functional.js Reference Documentation

**Overview**

`functional.js` is a comprehensive async programming library that provides 12 core utilities for handling asynchronous operations, error management, data transformations, and functional composition patterns in JavaScript/TypeScript. The library is designed with a pragmatic philosophy: avoid heavy abstractions, use eager execution, and provide clear, predictable error handling.

**Key Principles**

- **No heavy abstractions**: Plain JavaScript, eager execution, no virtual machines or monads
- **Pragmatic**: Sequential processing with clear error handling strategies
- **TypeScript-ready**: Written in modern JavaScript, supports async/await patterns throughout
- **Explicit error handling**: Two distinct strategies (`failFast` and `collect`) for different use cases
- **Testable**: All functions are designed to work with async/await patterns for easy testing

---

## Table of Contents

1. [failFast](#1-failfast) - Error Strategy Identifier
2. [collect](#2-collect) - Error Strategy Identifier
3. [tryCatch](#3-trycatch) - Single Function Lifecycle Hooks
4. [delay](#4-delay) - Promise-based Delays
5. [retry](#5-retry) - Configurable Retry Logic
6. [series](#6-series) - Horizontal Sequential Execution
7. [scan](#7-scan) - Stateful Sequential Transformation
8. [filter](#8-filter) - Stateless Selection
9. [safeScan](#9-safescan) - Safe Stateful Transformation
10. [pipe](#10-pipe) - Vertical Composition
11. [safeAsyncIterator](#11-safeasynciterator) - Lazy Async Iterator Wrapper
12. [collectAsync](#12-collectasync) - Async Iterator to Array

---

## 1. failFast

**Purpose**: Error strategy identifier used throughout the library to indicate immediate failure without partial results.

**Type**: `Object`

```javascript
export const failFast = Object.freeze({name: 'failFast'})
```

**Usage**: Passed as the `onError` parameter to other functions (like `filter`, `tryCatch`, `scan`) to specify that errors should be handled with the `failFast` strategy. This strategy stops immediately on the first error and returns a structured failure object containing the failed item and error.

---

## 2. collect

**Purpose**: Error strategy identifier used throughout the library to indicate that errors should be gathered and processing should continue.

**Type**: `Object`

```javascript
export const collect = Object.freeze({name: 'collect'})
```

**Usage**: Passed as the `onError` parameter to functions to specify that errors should be collected and processing should continue. This is used in `scan` and other operations where accumulating results is more important than failing fast.

---

## 3. tryCatch

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
  - `isCatch`: `boolean` (default: `true`) - Whether to use try/catch (pass `false` for manual error handling)

**Return Type**: Returns a wrapper function with the same signature as `fn`.

**Features**:
- Automatic `async/await` wrapping
- Preserves original function signature
- Supports both try/catch and manual error handling modes
- Comprehensive lifecycle: onStart → onSuccess/onError → onFinally
- Optional rethrow for error propagation
- Deep telemetry support for debugging (tracks which step in a 5-step pipe failed)

**Usage Example**:
```javascript
import { tryCatch } from './functional.js'

// Example 1: Try/catch mode
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

// Example 2: Manual error handling mode
const customFetch = tryCatch(
  async (url, options) => {
    // Manual error handling with rethrow
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error('Network error')
    }
    return await response.json()
  },
  {
    onError: async (error) => {
      console.error('Custom handler:', error)
    return { customHandled: true }
    },
    rethrow: true,
    isCatch: false
  }
)
```

---

## 4. delay

**Purpose**: Promise-based delay utility.

**Type**: `(ms: number) => Promise<void>`

**Parameters**:
- `ms`: Number of milliseconds to delay (required)

**Return Type**: A Promise that resolves after the specified delay.

**Usage Example**:
```javascript
import { delay } from './functional.js'

// Wait 1000ms before retrying
await delay(1000)

// Delay in a retry loop
for (let i = 0; i < 3; i++) {
  await someOperation()
  await delay(500)  // Wait before next attempt
}
```

---

## 5. retry

**Purpose**: Retry async functions with configurable attempts and delays between attempts.

**Type**: `(fn, options) => retryFunction`

**Parameters**:
- `fn`: The async function to retry (required)
- `options`: Configuration object with the following properties:
  - `attempts`: `number` (default: `3`) - Number of retry attempts
  - `delayMs`: `number` (default: `0`) - Delay between retry attempts in milliseconds

**Behavior**:
- Retries only on specified errors (if `onError` is provided)
- Throws the last error after exhausting all attempts
- No delay before first attempt
- Applies configured delay between subsequent attempts

**Usage Example**:
```javascript
import { retry } from './functional.js'

// Retry with default 3 attempts and 500ms delay
const result = await retry(
  async fetchWithRetry() => {
    return await fetch('/api/data')
  },
  {
    onError: 'failFast',  // Only retry on specific errors
    attempts: 3,
    delayMs: 500
  }
)

// Retry with custom configuration
const result = await retry(
  async flakyOperation() => {
    return Math.random() > 0.5 // Simulate 50% failure rate
  },
  {
    attempts: 5,
    delayMs: 1000,
    onError: 'collect'  // Collect all errors, don't fail fast
  }
)
```

---

## 6. series

**Purpose**: Horizontal composition tool - executes multiple functions in sequence, passing the output of one as input to the next.

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

**Usage Example**:
```javascript
import { series } from './functional.js'

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

**Best Practice**: Use `series()` when you need to chain async operations and ensure each completes before the next starts.

---

## 7. scan

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
- **Stop on error**: Can be configured to stop on first error via `safeScan`
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

// Process items with error tracking
const { results, errors } = await scan(
  async dataItems,
  async (acc, item) => {
    try {
      const processed = await processItem(item)
      return acc + processed.length
    } catch (error) {
      return acc  // Return count without incrementing
    }
  },
  0
)

// With safeScan (stops on first error)
const { results, errors, failure } = await safeScan(
  itemsToProcess,
  async (acc, item, index) => {
    return await transformItem(item)
  },
  0,
  { onError: failFast }
)
```

**When to Use**: Use `scan()` when you need to transform data sequentially and maintain state between steps, or when you need both results and errors for debugging.

---

## 8. filter

**Purpose**: Stateless selection tool - filters items from an iterable based on a predicate function.

**Type**: `(...args) => filteredItems | filterFunction`

**Parameters**:
- First argument (optional): If a function, specifies `take` and `onError` strategy
- Remaining arguments: Items to filter
- If first arg is NOT a function: Treated as `iterable` and processed with `take` strategy

**Strategies**:
- **failFast**: Stops immediately on first error (returns structured failure)
- **collect**: Gathers all errors and continues (default)

**Behavior**:
- With `failFast`: Returns `{ results, errors, failure: { item, error } }` object
- With `collect`: Returns `{ results, errors, failure: null }` object

**Usage Example**:
```javascript
import { filter } from './functional.js'

// Filter valid emails from a list
const validEmails = await filter(
  async (email) => {
    return email.includes('@')
  },
  emails,
  {
    onError: failFast  // Stop on first invalid email
  }
)

// Collect all errors with collect strategy
const { results, errors } = await filter(
  async (items, callback) => {
    return await callback(item)
  },
  list,
  {
    onError: collect  // Gather all errors
  }
)
```

---

## 9. safeScan

**Purpose**: Safe stateful transformation with immediate failure on error.

**Type**: `(iterable, scanner, initialValue) => safeScanFunction`

**Parameters**:
- `iterable`: An async iterable to process
- `scanner`: Transformation function `(accumulator, item, index) => newAccumulator`
- `initialValue`: Starting value for the accumulator

**Key Difference from scan**:
- **Stops immediately on error**: Cannot continue processing if a step fails
- **Returns structured failure**: Always returns `{ results, errors, failure: { item, error }` object for debugging
- **Use case**: When pipeline must stop if any step fails (e.g., database transaction, critical data validation)

**Usage Example**:
```javascript
import { safeScan } from './functional.js'

// Safe database operations - stop on any error
const { results, errors, failure } = await safeScan(
  async records,
  async (acc, record, index) => {
    const inserted = await db.insert(record)
    return acc + inserted
  },
  0,
  { onError: failFast }
)
```

---

## 10. pipe

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

## 11. safeAsyncIterator

**Purpose**: Lazy async iterator wrapper with comprehensive error handling.

**Type**: `iterable => asyncGenerator`

**Parameters**:
- `iterable`: An async iterable (array, generator, or any object implementing iteration protocol)
- `options`: Configuration object
  - `onError`: Error handler ('failFast' by default)

**Return Type**: An async generator that yields items one by one.

**Behavior**:
- Yields transformed items (via `transform`) or original items (if no transform)
- Forces error checking on every item
- Supports two modes: `failFast` (stop) or `collect` (continue)

**Usage Example**:
```javascript
import { safeAsyncIterator } from './functional.js'

// Transform items lazily with error handling
const iter = safeAsyncIterator(
  async fetchDataPages(),  // Generator
  async (page) => transformPage(page), // Transformer
  { onError: failFast }
)

for await (const item of iter) {
  console.log('Processing:', item)
}
```

---

## 12. collectAsync

**Purpose**: Collect all items from an async iterator/generator into an array.

**Type**: `iterator => collectAsync(iterator) => Promise<Array<T>>`

**Parameters**:
- `iterator`: An async iterator, generator, or iterable

**Return Type**: A Promise that resolves to an array of all yielded items.

**Behavior**:
- Executes iterator until completion
- Resolves with array of all items
- Handles both normal values and `{ error, item }` objects if iterator yields them

**Usage Example**:
```javascript
import { collectAsync } from './functional.js'

// Collect all pages from a generator
const allRecords = await collectAsync(
  async function* fetchAllPages() {
    let page = 1
    while (true) {
      const data = await fetchPage(page)
      yield data
      if (!data.hasMore) break
      page++
    }
  }
)

// Collect from async iterable
const items = await collectAsync(
  [fetchItem1(), fetchItem2(), fetchItem3()]
)
```

---

## Error Handling Strategies

The library provides two distinct error handling approaches:

### failFast Strategy
- **Behavior**: Stop immediately on first error
- **Use case**: Critical operations, validation failures, or when partial results are unacceptable
- **Returns**: `{ results, errors, failure: { item, error } }`

### collect Strategy
- **Behavior**: Gather all errors and continue processing
- **Use case**: Accumulating results, data validation, or when you need complete error history
- **Returns**: `{ results, errors, failure: null }`

---

## Best Practices

1. **Choose the Right Strategy**:
   - Use `failFast` for critical operations where any error means total failure
   - Use `collect` when you need to accumulate errors or continue on validation failures
   - Use `tryCatch` for single operations needing lifecycle hooks

2. **Stateful vs Stateless**:
   - `scan` and `safeScan` are stateful (maintain accumulator)
   - `filter` is stateless (no accumulator maintained)

3. **Composition**:
   - Use `series()` for horizontal pipelines
   - Use `pipe()` for vertical composition (data flows left-to-right)

4. **Error Propagation**:
   - Set `rethrow: true` in `tryCatch` to propagate errors up the call stack
   - Set `rethrow: false` when you want to handle errors locally

5. **Telemetry and Debugging**:
   - Use lifecycle hooks (`onStart`, `onSuccess`, `onError`) to track execution flow
   - Check structured error objects for `{ item, error }` properties to identify which step failed

6. **Performance**:
   - Avoid nesting `series()` calls unnecessarily - compose related operations together
   - Use appropriate error strategy - don't always use `collect` if `failFast` is sufficient

---

## TypeScript Support

All functions are written in JavaScript with full TypeScript compatibility:
- Support for generics and typed parameters
- Clear parameter and return type signatures
- Compatible with modern async/await patterns

---

## Migration from v0.x to v1.x

If upgrading from pipelean v0.x, note the following changes:

1. **tryCatch** signature change:
   - Old: `tryCatch(fn, handlers)` where handlers was an object
   - New: `tryCatch(fn, options)` where options is an object with hook functions

2. **Error handling**: More flexible with explicit hook system

---

## Architecture Notes

The library follows Unix philosophy:
- **Small, composable tools**: Each function does one thing well
- **Clear contracts**: Input types and output types are explicit
- **Eager execution**: Functions execute immediately, no lazy evaluation
- **Explicit error handling**: Errors are handled explicitly, not hidden

This makes `functional.js` suitable for:
- Building robust async pipelines
- Implementing retry logic
- Creating stateful transformations
- Handling data validation
- Composing complex operations from simple primitives

---

## Related Documentation

- **[README.md](../README.md)** - Project overview and philosophy
- **[guide.md](../guide.md)** - Comprehensive development guide with examples
- **[examples.md](../examples.md)** - Practical usage examples for all functions
