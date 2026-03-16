# Pipelean Redesign Specification

## Overview

Pipelean is being redesigned as an iterator-first library for composing async operations with consistent error handling. The core insight is that error management belongs at the pipeline level, not individual operations.

## Core Principles

1. **Iterator-First**: All transformations work on async iterators
2. **Pipeline Error Management**: Error strategies are applied at pipeline level
3. **Pure Operations**: Individual operations (map, filter, reduce) succeed or throw
4. **Unified Composition**: Single way to compose operations regardless of input type

## API Design

### Error Strategies

Three error strategies control how errors are handled:

1. **`failFast`** (default): Stop iteration and throw on first error
2. **`collect`**: Continue iteration, accumulate errors in final result
3. **`notify`**: Continue iteration, accumulate errors, and call notification callback

### Core Functions

#### `map(fn)`
Creates a mapping iterator transformation.

```javascript
const double = map(x => x * 2)
// Returns: async iterator transformer
```

#### `filter(predicate)`
Creates a filtering iterator transformation.

```javascript
const evenOnly = filter(x => x % 2 === 0)
```

#### `reduce(fn, initial)`
Creates a reducing iterator transformation.

```javascript
const sum = reduce((acc, x) => acc + x, 0)
```

#### `compose(...transformers)`
Composes multiple iterator transformations.

```javascript
const pipeline = compose(
  map(x => x * 2),
  filter(x => x > 5),
  map(async x => ({value: x, meta: await fetchMeta(x)}))
)
```

#### `collect(iterator, options)`
Collects results from an iterator with error handling.

```javascript
const {results, errors} = await collect(iterator, {
  onError: 'collect', // or 'failFast', 'notify'
  notify: (error, item) => console.error('Error:', error) // for 'notify' strategy
})
```

### Usage Examples

#### Basic Pipeline

```javascript
import {map, filter, compose, collect} from 'pipelean'

const pipeline = compose(
  map(x => x * 2),
  filter(x => x > 5)
)

// From array
const data = [1, 2, 3, 4, 5]
const iterator = pipeline(data, {onError: 'collect'})
const {results, errors} = await collect(iterator)

// results: [6, 8, 10]
// errors: [] (if no errors)
```

#### Async Operations with Error Handling

```javascript
const pipeline = compose(
  map(async x => {
    if (x === 3) throw new Error('Bad value')
    return x * 2
  }),
  filter(x => x > 0)
)

const iterator = pipeline([1, 2, 3, 4], {onError: 'collect'})
const {results, errors} = await collect(iterator)

// results: [2, 4, 8] (skipped x=3 due to error)
// errors: [{item: 3, error: Error('Bad value')}]
```

#### Notification Strategy

```javascript
const iterator = pipeline(data, {
  onError: 'notify',
  notify: (error, item) => {
    console.log(`Error processing ${item}:`, error.message)
    // Could send to monitoring service
  }
})

const {results, errors} = await collect(iterator)
// errors still contains all errors
// notify callback was called for each error as it occurred
```

#### Lazy Iteration

```javascript
const iterator = pipeline(largeDataset, {onError: 'collect'})

for await (const item of iterator) {
  // Process items as they come
  // Errors are handled according to strategy
  // For 'collect' strategy, failed items are skipped
  // For 'notify' strategy, errors are logged via callback
  console.log(item)
}
```

### Implementation Details

#### Iterator Transformation Signature

```javascript
// Each transformer is a function that takes options and returns an async generator
function map(fn) {
  return async function* (source, options) {
    for await (const item of source) {
      try {
        yield await fn(item)
      } catch (error) {
        if (options.onError === 'failFast') {
          throw error
        }
        // For 'collect' and 'notify', skip the item
        // Error is accumulated in the collector
        if (options.onError === 'notify' && options.notify) {
          options.notify(error, item)
        }
        // Yield a sentinel or let collector track errors
      }
    }
  }
}
```

#### Composition Implementation

```javascript
function compose(...transformers) {
  return async function* (source, options) {
    let current = source
    for (const transformer of transformers) {
      current = transformer(current, options)
    }
    yield* current
  }
}
```

#### Collector Implementation

```javascript
async function collect(iterator, options = {}) {
  const results = []
  const errors = []
  const {onError = 'failFast', notify} = options

  try {
    for await (const item of iterator) {
      results.push(item)
    }
  } catch (error) {
    if (onError === 'failFast') {
      throw error
    }
    // For iterator-based error handling, errors are tracked differently
  }

  return {results, errors}
}
```

### Migration from Current API

| Current API | New API |
|-------------|---------|
| `safeMap(array, fn, {onError})` | `collect(compose(map(fn))(array), {onError})` |
| `safeFilter(array, pred, {onError})` | `collect(compose(filter(pred))(array), {onError})` |
| `safePipe(op1, op2, op3)` | `compose(op1, op2, op3)` |
| `safeAsyncIterator(iterable, fn, {onError})` | `compose(map(fn))(iterable, {onError})` |
| `collectAsync(iterable, {onError})` | `collect(iterable, {onError})` |

### Benefits

1. **Clean Separation**: Operations are pure, error handling is compositional
2. **Consistent API**: Same pattern works for arrays, iterators, and streams
3. **Flexible Error Handling**: Strategies can be extended without changing operations
4. **Memory Efficient**: Lazy iteration by default
5. **Easy Testing**: Pure operations are trivial to test

### Open Questions

1. Should `reduce` be a transformer or a terminal operation?
2. How to handle early termination (like `take` operation)?
3. Should there be convenience functions for common patterns?
4. How to integrate with existing async iterator ecosystems?

## Next Steps

1. Implement core transformer functions (map, filter, reduce)
2. Implement composition and collection
3. Write comprehensive tests
4. Update documentation
5. Deprecate old API gradually