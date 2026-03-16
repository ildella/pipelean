# Pipelean Architecture Options

Based on our analysis, here are three architectural approaches for redesigning the library.

## Current Issues Identified

1. **Redundant error strategies**: `skip` and `collect` are identical in implementation
2. **Error management in wrong place**: `safeMap`/`safeFilter` handle errors, but you believe errors should be managed at pipeline level
3. **Missing promised features**: `safePipe` mentioned in README but not implemented
4. **Inconsistent naming**: `unwrapIterator` vs `collectAsync`, `mapSeries` incomplete

## Option 1: Pipeline-Centric Approach

**Core Idea**: Individual operations are pure (succeed or throw), pipelines manage errors and composition.

### Example Usage

```javascript
// Pure operations that succeed or throw
const double = map(x => x * 2)
const filterEven = filter(x => x % 2 === 0)
const asyncEnrich = map(async x => ({...x, meta: await fetch(x.id)}))

// Pipeline with error strategy
const pipeline = pipe(
  double,
  filterEven,
  asyncEnrich
).withStrategy('collect') // or 'failFast', 'collectWithNotify'

// Execute with error handling
const {results, errors, failure} = await pipeline([1, 2, 3, 4, 5])

// Or with iterator
for await (const result of pipeline.asIterator([1, 2, 3])) {
  // yields transformed items or error objects based on strategy
}
```

### Implementation Sketch

```javascript
// Pure operation
const map = (fn) => (item) => fn(item)

// Pipeline builder
const pipe = (...operations) => {
  const execute = async (items, strategy = 'failFast') => {
    const results = []
    const errors = []

    for await (const item of items) {
      try {
        let value = item
        for (const op of operations) {
          value = await op(value)
        }
        results.push(value)
      } catch (error) {
        if (strategy === 'failFast') {
          return {results, errors, failure: {item, error}}
        }
        errors.push({item, error})
        if (strategy === 'collect') {
          // skip item
        } else if (strategy === 'collectWithNotify') {
          // call notification callback
        }
      }
    }
    return {results, errors, failure: null}
  }

  return {
    withStrategy: (strategy) => (items) => execute(items, strategy),
    asIterator: (strategy) => async function* (items) { /* ... */ }
  }
}
```

**Pros**:
- Clean separation of concerns
- Operations are simple and testable
- Easy to add new error strategies
- Consistent with functional programming principles

**Cons**:
- More boilerplate for simple cases
- Error handling detached from operation logic

## Option 2: Unified Transformer Approach

**Core Idea**: Single configurable transformation function that can behave as map, filter, reduce, etc.

### Example Usage

```javascript
// Configure as different operations
const double = transform({
  type: 'map',
  fn: x => x * 2,
  onError: 'skip' // error strategy per operation
})

const filterEven = transform({
  type: 'filter',
  fn: x => x % 2 === 0,
  onError: 'collect'
})

const sum = transform({
  type: 'reduce',
  fn: (acc, x) => acc + x,
  initial: 0,
  onError: 'failFast'
})

// Compose transforms
const pipeline = compose(double, filterEven, sum)

// Execute
const result = await pipeline([1, 2, 3, 4, 5])
// result = {value: 12, errors: [], failure: null}
```

### Implementation Sketch

```javascript
const transform = (config) => {
  const {type, fn, onError = 'failFast', ...rest} = config

  return async (input) => {
    if (type === 'map') {
      return transformMap(input, fn, onError)
    } else if (type === 'filter') {
      return transformFilter(input, fn, onError)
    } else if (type === 'reduce') {
      return transformReduce(input, fn, onError, rest.initial)
    }
  }
}

const compose = (...transforms) => async (input) => {
  let current = input
  const allErrors = []

  for (const t of transforms) {
    const result = await t(current)
    if (result.failure) return {value: null, errors: allErrors, failure: result.failure}
    allErrors.push(...result.errors)
    current = result.value
  }

  return {value: current, errors: allErrors, failure: null}
}
```

**Pros**:
- Single API to learn
- Highly configurable
- Consistent error handling across operation types
- Easy to extend with new operation types

**Cons**:
- Configuration over convention
- Less intuitive than named functions
- Type checking more complex

## Option 3: Iterator-First Approach

**Core Idea**: Everything is an async iterator transformation, with error strategies built into the iteration protocol.

### Example Usage

```javascript
// Create transforming iterators
const doubleIterator = mapIterator(x => x * 2)
const filterEvenIterator = filterIterator(x => x % 2 === 0)

// Compose iterators
const pipelineIterator = composeIterators(
  doubleIterator,
  filterEvenIterator
)

// Use with error strategy
const iterator = pipelineIterator([1, 2, 3, 4, 5], {onError: 'collect'})

// Iterate with errors handled
for await (const item of iterator) {
  // item is either transformed value or {error, originalItem}
  if (item.error) {
    console.log('Error:', item.error)
    continue
  }
  console.log('Result:', item)
}

// Or collect all
const {results, errors} = await collectIterator(iterator)
```

### Implementation Sketch

```javascript
async function* mapIterator(fn) {
  for await (const item of this) {
    try {
      yield await fn(item)
    } catch (error) {
      if (this.onError === 'failFast') throw error
      if (this.onError === 'skip') continue
      if (this.onError === 'collect') yield {error, item}
    }
  }
}

const composeIterators = (...iteratorFns) => {
  return async function* (source, options) {
    let current = source
    for (const iteratorFn of iteratorFns) {
      current = iteratorFn.call({onError: options.onError}, current)
    }
    yield* current
  }
}

const collectIterator = async (iterator) => {
  const results = []
  const errors = []

  for await (const item of iterator) {
    if (item && item.error) {
      errors.push(item)
    } else {
      results.push(item)
    }
  }

  return {results, errors}
}
```

**Pros**:
- Natural fit for async/streaming data
- Lazy evaluation by default
- Easy to integrate with existing async iterators
- Memory efficient for large datasets

**Cons**:
- Iterator protocol can be unfamiliar
- More complex error handling in consumer code
- Two modes of consumption (iteration vs collection)

## Recommendation

Given your goals and the current codebase, I recommend a **hybrid of Options 1 and 3**:

1. **Pipeline-centric composition** for the high-level API
2. **Iterator-based implementation** for efficiency and streaming support
3. **Clear separation**: pure operations + pipeline error management

This aligns with your insight that "a single operation can just succeed or fail, nothing else, is the pipe that has an error strategy."

The next step would be to design the exact API based on this hybrid approach.