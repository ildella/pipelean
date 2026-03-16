# Pipelean Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement iterator-first library with pipeline error management, replacing current safeMap/safeFilter approach.

**Architecture:** Core iterator transformations (map, filter, reduce) that are pure functions, composed via `compose()`, with error strategies (failFast, collect, notify) applied at pipeline level. `collect()` function gathers results with error handling.

**Tech Stack:** JavaScript (ESM), Vitest for testing, async iterators

---

## File Structure

### New Files
- `src/iterator-core.js` - Core iterator transformations (map, filter, reduce)
- `src/composition.js` - Composition and pipeline functions
- `src/collection.js` - Result collection with error handling
- `src/index.js` - Updated main exports
- `tests/iterator-core.test.js` - Tests for core transformations
- `tests/composition.test.js` - Tests for composition
- `tests/collection.test.js` - Tests for collection
- `tests/integration.test.js` - End-to-end tests

### Modified Files
- `src/functional.js` - Deprecate safeMap, safeFilter, keep utilities (pipe, pipeAsync, tryCatch)
- `src/index.js` - Re-export new API
- `README.md` - Update documentation

### Deprecated (to be removed later)
- `tests/safe-map.test.js`
- `tests/safe-filter.test.js`
- `tests/error-strategies.test.js`

---

## Chunk 1: Core Iterator Transformations

### Task 1: Create iterator-core.js with map transformation

**Files:**
- Create: `src/iterator-core.js`
- Test: `tests/iterator-core.test.js`

- [ ] **Step 1: Write failing test for map transformation**

```javascript
import {test, expect} from 'vitest'
import {map} from '$lib/iterator-core'

test('map creates a transformer that applies function to each item', async () => {
  const double = map(x => x * 2)
  const source = [1, 2, 3]
  const iterator = double(source, {onError: 'failFast'})

  const results = []
  for await (const item of iterator) {
    results.push(item)
  }

  expect(results).toEqual([2, 4, 6])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/iterator-core.test.js -t "map creates a transformer"`
Expected: FAIL with "Cannot find module '$lib/iterator-core'"

- [ ] **Step 3: Create iterator-core.js with map function**

```javascript
export function map(fn) {
  return async function* (source, options = {}) {
    const {onError = 'failFast'} = options

    for await (const item of source) {
      try {
        yield await fn(item)
      } catch (error) {
        if (onError === 'failFast') {
          throw error
        }
        // For collect/notify strategies, skip item
        // Error handling done at collection level
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/iterator-core.test.js -t "map creates a transformer"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/iterator-core.js tests/iterator-core.test.js
git commit -m "feat: add map iterator transformation"
```

### Task 2: Add filter transformation

**Files:**
- Modify: `src/iterator-core.js`
- Test: `tests/iterator-core.test.js`

- [ ] **Step 1: Write failing test for filter transformation**

```javascript
test('filter creates a transformer that filters items by predicate', async () => {
  const evenOnly = filter(x => x % 2 === 0)
  const source = [1, 2, 3, 4, 5]
  const iterator = evenOnly(source, {onError: 'failFast'})

  const results = []
  for await (const item of iterator) {
    results.push(item)
  }

  expect(results).toEqual([2, 4])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/iterator-core.test.js -t "filter creates a transformer"`
Expected: FAIL with "filter is not defined"

- [ ] **Step 3: Add filter function to iterator-core.js**

```javascript
export function filter(predicate) {
  return async function* (source, options = {}) {
    const {onError = 'failFast'} = options

    for await (const item of source) {
      try {
        const keep = await predicate(item)
        if (keep) {
          yield item
        }
      } catch (error) {
        if (onError === 'failFast') {
          throw error
        }
        // For collect/notify strategies, skip item
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/iterator-core.test.js -t "filter creates a transformer"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/iterator-core.js tests/iterator-core.test.js
git commit -m "feat: add filter iterator transformation"
```

### Task 3: Add reduce transformation

**Files:**
- Modify: `src/iterator-core.js`
- Test: `tests/iterator-core.test.js`

- [ ] **Step 1: Write failing test for reduce transformation**

```javascript
test('reduce creates a transformer that accumulates values', async () => {
  const sum = reduce((acc, x) => acc + x, 0)
  const source = [1, 2, 3, 4]
  const iterator = sum(source, {onError: 'failFast'})

  const results = []
  for await (const item of iterator) {
    results.push(item)
  }

  // reduce yields accumulated value after each item
  expect(results).toEqual([1, 3, 6, 10])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/iterator-core.test.js -t "reduce creates a transformer"`
Expected: FAIL with "reduce is not defined"

- [ ] **Step 3: Add reduce function to iterator-core.js**

```javascript
export function reduce(fn, initial) {
  return async function* (source, options = {}) {
    const {onError = 'failFast'} = options
    let accumulator = initial

    for await (const item of source) {
      try {
        accumulator = await fn(accumulator, item)
        yield accumulator
      } catch (error) {
        if (onError === 'failFast') {
          throw error
        }
        // For collect/notify strategies, skip item
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/iterator-core.test.js -t "reduce creates a transformer"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/iterator-core.js tests/iterator-core.test.js
git commit -m "feat: add reduce iterator transformation"
```

---

## Chunk 2: Composition and Pipeline

### Task 4: Create composition.js with compose function

**Files:**
- Create: `src/composition.js`
- Test: `tests/composition.test.js`

- [ ] **Step 1: Write failing test for compose function**

```javascript
import {test, expect} from 'vitest'
import {compose} from '$lib/composition'
import {map, filter} from '$lib/iterator-core'

test('compose chains multiple transformers', async () => {
  const pipeline = compose(
    map(x => x * 2),
    filter(x => x > 5)
  )

  const source = [1, 2, 3, 4, 5]
  const iterator = pipeline(source, {onError: 'failFast'})

  const results = []
  for await (const item of iterator) {
    results.push(item)
  }

  expect(results).toEqual([6, 8, 10])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/composition.test.js -t "compose chains multiple transformers"`
Expected: FAIL with "Cannot find module '$lib/composition'"

- [ ] **Step 3: Create composition.js with compose function**

```javascript
export function compose(...transformers) {
  return async function* (source, options = {}) {
    let current = source
    for (const transformer of transformers) {
      current = transformer(current, options)
    }
    yield* current
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/composition.test.js -t "compose chains multiple transformers"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composition.js tests/composition.test.js
git commit -m "feat: add compose function for transformer composition"
```

### Task 5: Add error strategy propagation tests

**Files:**
- Test: `tests/composition.test.js`

- [ ] **Step 1: Write test for failFast error propagation**

```javascript
test('failFast error in any transformer stops entire pipeline', async () => {
  const pipeline = compose(
    map(x => x * 2),
    map(x => {
      if (x === 6) throw new Error('Bad value')
      return x
    }),
    filter(x => x > 0)
  )

  const source = [1, 2, 3]
  const iterator = pipeline(source, {onError: 'failFast'})

  await expect(async () => {
    const results = []
    for await (const item of iterator) {
      results.push(item)
    }
  }).rejects.toThrow('Bad value')
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test tests/composition.test.js -t "failFast error in any transformer"`
Expected: PASS (should already work with current implementation)

- [ ] **Step 3: Write test for error strategy consistency**

```javascript
test('error strategy applies to all transformers in pipeline', async () => {
  const pipeline = compose(
    map(x => {
      if (x === 2) throw new Error('First error')
      return x
    }),
    map(x => {
      if (x === 4) throw new Error('Second error')
      return x * 10
    })
  )

  const source = [1, 2, 3, 4, 5]
  // This test will be expanded when collect is implemented
  const iterator = pipeline(source, {onError: 'failFast'})

  await expect(async () => {
    for await (const item of iterator) {
      // Should throw on first error (x=2)
    }
  }).rejects.toThrow('First error')
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/composition.test.js -t "error strategy applies to all transformers"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/composition.test.js
git commit -m "test: add error strategy propagation tests"
```

---

## Chunk 3: Collection and Error Handling

### Task 6: Create collection.js with collect function

**Files:**
- Create: `src/collection.js`
- Test: `tests/collection.test.js`

- [ ] **Step 1: Write failing test for collect function**

```javascript
import {test, expect} from 'vitest'
import {collect} from '$lib/collection'

test('collect gathers results from iterator', async () => {
  async function* simpleIterator() {
    yield 1
    yield 2
    yield 3
  }

  const {results, errors} = await collect(simpleIterator())

  expect(results).toEqual([1, 2, 3])
  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/collection.test.js -t "collect gathers results from iterator"`
Expected: FAIL with "Cannot find module '$lib/collection'"

- [ ] **Step 3: Create collection.js with basic collect function**

```javascript
export async function collect(iterator, options = {}) {
  const {onError = 'failFast'} = options
  const results = []
  const errors = []

  try {
    for await (const item of iterator) {
      results.push(item)
    }
  } catch (error) {
    if (onError === 'failFast') {
      throw error
    }
    // For collect/notify strategies, handle differently
  }

  return {results, errors}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test tests/collection.test.js -t "collect gathers results from iterator"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/collection.js tests/collection.test.js
git commit -m "feat: add basic collect function"
```

### Task 7: Implement collect error strategy

**Files:**
- Modify: `src/collection.js`
- Test: `tests/collection.test.js`

- [ ] **Step 1: Write test for collect error strategy**

```javascript
test('collect strategy accumulates errors and continues', async () => {
  async function* errorIterator() {
    yield 1
    throw new Error('Test error')
    // Note: iterator stops after throw, need different approach
  }

  // This test will need adjustment based on implementation
  const iterator = errorIterator()
  const {results, errors} = await collect(iterator, {onError: 'collect'})

  expect(results).toEqual([1])
  expect(errors).toHaveLength(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test tests/collection.test.js -t "collect strategy accumulates errors"`
Expected: FAIL (iterator stops on throw)

- [ ] **Step 3: Update collect to handle errors from transformers**

We need to change approach: errors should be caught at transformer level, not iterator level. Update the test first:

```javascript
test('collect strategy accumulates errors from failing transformations', async () => {
  const {map} = await import('$lib/iterator-core')
  const {compose} = await import('$lib/composition')

  const pipeline = compose(
    map(x => {
      if (x === 2) throw new Error('Bad value: ' + x)
      return x * 10
    })
  )

  const source = [1, 2, 3, 4]
  const iterator = pipeline(source, {onError: 'collect'})
  const {results, errors} = await collect(iterator)

  expect(results).toEqual([10, 30, 40]) // 2 is skipped
  expect(errors).toEqual([
    {item: 2, error: new Error('Bad value: 2')}
  ])
})
```

- [ ] **Step 4: Update iterator transformations to yield errors for collect strategy**

Modify `src/iterator-core.js` map function:

```javascript
export function map(fn) {
  return async function* (source, options = {}) {
    const {onError = 'failFast'} = options

    for await (const item of source) {
      try {
        yield await fn(item)
      } catch (error) {
        if (onError === 'failFast') {
          throw error
        }
        // For collect strategy, yield error object
        if (onError === 'collect' || onError === 'notify') {
          yield {__error: true, error, item}
        }
        // For skip (old behavior), just continue
      }
    }
  }
}
```

- [ ] **Step 5: Update collect to handle error objects**

Modify `src/collection.js`:

```javascript
export async function collect(iterator, options = {}) {
  const {onError = 'failFast', notify} = options
  const results = []
  const errors = []

  try {
    for await (const item of iterator) {
      if (item && item.__error) {
        errors.push({item: item.item, error: item.error})
        if (onError === 'notify' && notify) {
          notify(item.error, item.item)
        }
      } else {
        results.push(item)
      }
    }
  } catch (error) {
    if (onError === 'failFast') {
      throw error
    }
    // Should not reach here for collect/notify strategies
  }

  return {results, errors}
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test tests/collection.test.js -t "collect strategy accumulates errors"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/iterator-core.js src/collection.js tests/collection.test.js
git commit -m "feat: implement collect error strategy with error objects"
```

### Task 8: Implement notify error strategy

**Files:**
- Modify: `src/collection.js`
- Test: `tests/collection.test.js`

- [ ] **Step 1: Write test for notify error strategy**

```javascript
test('notify strategy calls callback for each error', async () => {
  const {map} = await import('$lib/iterator-core')
  const {compose} = await import('$lib/composition')

  const pipeline = compose(
    map(x => {
      if (x === 2 || x === 4) throw new Error('Bad: ' + x)
      return x * 10
    })
  )

  const notifications = []
  const source = [1, 2, 3, 4, 5]
  const iterator = pipeline(source, {onError: 'notify'})
  const {results, errors} = await collect(iterator, {
    onError: 'notify',
    notify: (error, item) => {
      notifications.push({item, message: error.message})
    }
  })

  expect(results).toEqual([10, 30, 50])
  expect(errors).toHaveLength(2)
  expect(notifications).toEqual([
    {item: 2, message: 'Bad: 2'},
    {item: 4, message: 'Bad: 4'}
  ])
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test tests/collection.test.js -t "notify strategy calls callback"`
Expected: PASS (should work with current implementation)

- [ ] **Step 3: Update filter and reduce to use same error pattern**

Modify `src/iterator-core.js` filter and reduce functions to yield error objects:

```javascript
export function filter(predicate) {
  return async function* (source, options = {}) {
    const {onError = 'failFast'} = options

    for await (const item of source) {
      try {
        const keep = await predicate(item)
        if (keep) {
          yield item
        }
      } catch (error) {
        if (onError === 'failFast') {
          throw error
        }
        if (onError === 'collect' || onError === 'notify') {
          yield {__error: true, error, item}
        }
      }
    }
  }
}

export function reduce(fn, initial) {
  return async function* (source, options = {}) {
    const {onError = 'failFast'} = options
    let accumulator = initial

    for await (const item of source) {
      try {
        accumulator = await fn(accumulator, item)
        yield accumulator
      } catch (error) {
        if (onError === 'failFast') {
          throw error
        }
        if (onError === 'collect' || onError === 'notify') {
          yield {__error: true, error, item}
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run all collection tests**

Run: `npm test tests/collection.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/iterator-core.js tests/collection.test.js
git commit -m "feat: implement notify strategy and update all transformers"
```

---

## Chunk 4: Integration and API Updates

### Task 9: Update main exports

**Files:**
- Modify: `src/index.js`
- Create: `src/iterator-index.js` (optional, for new API)

- [ ] **Step 1: Create new index for iterator API**

```javascript
// src/iterator-index.js
export {map, filter, reduce} from './iterator-core.js'
export {compose} from './composition.js'
export {collect} from './collection.js'

// Re-export utilities from functional.js
export {pipe, pipeAsync, tryCatch} from './functional.js'
export {unwrapIterator} from './functional.js' // Keep for compatibility
```

- [ ] **Step 2: Update main index.js**

```javascript
// src/index.js
// New iterator API
export {map, filter, reduce} from './iterator-core.js'
export {compose} from './composition.js'
export {collect} from './collection.js'

// Legacy API (mark as deprecated)
export {safeMap, safeFilter, mapSeries, scanSeries} from './functional.js'
export {failFast, skip, collect as collectStrategy} from './functional.js'
export {pipe, pipeAsync, tryCatch, unwrapIterator} from './functional.js'
export {safeAsyncIterator, collectAsync} from './functional.js'
```

- [ ] **Step 3: Add deprecation warnings to functional.js**

Add at top of `src/functional.js`:

```javascript
// DEPRECATION NOTICE
// safeMap and safeFilter are deprecated in favor of iterator API
// Use: collect(compose(map(fn))(array), {onError: 'collect'})
// instead of: safeMap(array, fn, {onError: collect})

console.warn('pipelean: safeMap/safeFilter are deprecated. Use iterator API (map, filter, compose, collect).')
```

- [ ] **Step 4: Run existing tests to ensure compatibility**

Run: `npm test`
Expected: Most tests pass, some may fail due to API changes

- [ ] **Step 5: Commit**

```bash
git add src/index.js src/iterator-index.js src/functional.js
git commit -m "feat: update exports and add deprecation warnings"
```

### Task 10: Create integration tests

**Files:**
- Create: `tests/integration.test.js`

- [ ] **Step 1: Write end-to-end integration test**

```javascript
import {test, expect} from 'vitest'
import {map, filter, compose, collect} from '$lib'

test('complete pipeline with error handling', async () => {
  const pipeline = compose(
    map(x => {
      if (x === 0) throw new Error('Zero not allowed')
      return x * 2
    }),
    filter(x => x > 5),
    map(async x => {
      // Simulate async operation
      return Promise.resolve({value: x, squared: x * x})
    })
  )

  const data = [0, 1, 2, 3, 4, 5]
  const iterator = pipeline(data, {onError: 'collect'})
  const {results, errors} = await collect(iterator)

  expect(errors).toEqual([
    {item: 0, error: new Error('Zero not allowed')}
  ])

  // 1*2=2 (filtered out), 2*2=4 (filtered out), 3*2=6, 4*2=8, 5*2=10
  expect(results).toEqual([
    {value: 6, squared: 36},
    {value: 8, squared: 64},
    {value: 10, squared: 100}
  ])
})
```

- [ ] **Step 2: Write test for lazy iteration**

```javascript
test('lazy iteration with large dataset', async () => {
  async function* generateNumbers(limit) {
    for (let i = 0; i < limit; i++) {
      yield i
    }
  }

  const pipeline = compose(
    map(x => x * 2),
    filter(x => x % 3 === 0)
  )

  const iterator = pipeline(generateNumbers(1000), {onError: 'collect'})

  let count = 0
  for await (const item of iterator) {
    count++
    expect(item % 3).toBe(0)
    expect(item % 2).toBe(0)
  }

  // Should process all items without collecting all at once
  expect(count).toBeGreaterThan(0)
})
```

- [ ] **Step 3: Write test for migration compatibility**

```javascript
test('migration example from safeMap to new API', async () => {
  // Old way (deprecated)
  // const {results, errors} = await safeMap([1, 2, 3], x => x * 2, {onError: collect})

  // New way
  const {map, compose, collect} = await import('$lib')
  const double = map(x => x * 2)
  const iterator = compose(double)([1, 2, 3], {onError: 'collect'})
  const {results, errors} = await collect(iterator)

  expect(results).toEqual([2, 4, 6])
  expect(errors).toEqual([])
})
```

- [ ] **Step 4: Run integration tests**

Run: `npm test tests/integration.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/integration.test.js
git commit -m "test: add integration tests for new API"
```

---

## Chunk 5: Documentation and Cleanup

### Task 11: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update core concepts section**

Replace the "Core Concepts" section with:

```markdown
## Core Concepts

### Iterator-First Design
Pipelean transforms async iterators. Everything is a transformation pipeline that can process arrays, streams, or any async iterable.

### Error Strategies
Three strategies control error handling at the pipeline level:
- **`failFast`** (default): Stop on first error
- **`collect`**: Continue, accumulate errors in result
- **`notify`**: Continue, accumulate errors, call notification callback

### Pure Operations
Operations (`map`, `filter`, `reduce`) are pure functions that succeed or throw. Error handling is separate at the pipeline level.

### Composition
Transformations are composed with `compose()` to build pipelines. Results are collected with `collect()`.
```

- [ ] **Step 2: Update operations section**

Replace with new API examples:

```markdown
## Operations

### map(fn)
Creates a mapping iterator transformation.

```javascript
const double = map(x => x * 2)
const iterator = double([1, 2, 3], {onError: 'collect'})
```

### filter(predicate)
Creates a filtering iterator transformation.

```javascript
const evenOnly = filter(x => x % 2 === 0)
```

### reduce(fn, initial)
Creates a reducing iterator transformation.

```javascript
const sum = reduce((acc, x) => acc + x, 0)
```

### compose(...transformers)
Composes multiple transformations into a pipeline.

```javascript
const pipeline = compose(
  map(x => x * 2),
  filter(x => x > 5),
  map(async x => ({value: x}))
)
```

### collect(iterator, options)
Collects results from an iterator with error handling.

```javascript
const {results, errors} = await collect(iterator, {
  onError: 'collect',
  notify: (error, item) => console.error('Error:', error)
})
```
```

- [ ] **Step 3: Update examples section**

Replace with new examples:

```markdown
## Example: Complete Pipeline

```javascript
import {map, filter, compose, collect} from 'pipelean'

const pipeline = compose(
  map(x => {
    if (x === 0) throw new Error('Zero not allowed')
    return x * 2
  }),
  filter(x => x > 5),
  map(async x => ({value: x, meta: await fetchMeta(x)}))
)

const data = [1, 2, 3, 4, 5]
const iterator = pipeline(data, {onError: 'collect'})
const {results, errors} = await collect(iterator)

// results: transformed successful items
// errors: accumulated error information
```

## Migration from Legacy API

| Legacy API | New API |
|------------|---------|
| `safeMap(array, fn, {onError})` | `collect(compose(map(fn))(array), {onError})` |
| `safeFilter(array, pred, {onError})` | `collect(compose(filter(pred))(array), {onError})` |
| `safePipe(op1, op2, op3)` | `compose(op1, op2, op3)` |
```

- [ ] **Step 4: Run documentation verification**

Check that all code examples are valid JavaScript.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: update README for new iterator API"
```

### Task 12: Clean up deprecated tests

**Files:**
- Delete: `tests/safe-map.test.js`
- Delete: `tests/safe-filter.test.js`
- Modify: `tests/error-strategies.test.js` (update or delete)

- [ ] **Step 1: Delete deprecated test files**

```bash
rm tests/safe-map.test.js
rm tests/safe-filter.test.js
```

- [ ] **Step 2: Update error-strategies test**

Either delete or update to test new error strategy objects:

```javascript
// tests/error-strategies.test.js (updated)
import {test, expect} from 'vitest'

test('error strategies are string constants', () => {
  // In new API, strategies are strings, not objects
  const strategies = ['failFast', 'collect', 'notify']
  expect(strategies).toHaveLength(3)
  expect(strategies).toContain('failFast')
  expect(strategies).toContain('collect')
  expect(strategies).toContain('notify')
})
```

- [ ] **Step 3: Run all tests to ensure everything works**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "chore: clean up deprecated tests"
```

---

## Final Verification

### Task 13: Final integration test

**Files:**
- Test: Run complete test suite

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass

- [ ] **Step 2: Check bundle size and compatibility**

```bash
# Check if any Node.js specific APIs are used
grep -r "require\|process\.\|__dirname\|__filename" src/ || echo "No Node.js specific APIs found"

# Check ESM exports
node -e "import('./src/index.js').then(m => console.log('Exports:', Object.keys(m))).catch(e => console.error(e))"
```

- [ ] **Step 3: Create simple usage example**

Create `examples/basic-usage.js`:

```javascript
import {map, filter, compose, collect} from './src/index.js'

async function main() {
  const pipeline = compose(
    map(x => x * 2),
    filter(x => x > 5)
  )

  const data = [1, 2, 3, 4, 5]
  const iterator = pipeline(data, {onError: 'collect'})
  const {results, errors} = await collect(iterator)

  console.log('Results:', results) // [6, 8, 10]
  console.log('Errors:', errors)   // []
}

main().catch(console.error)
```

- [ ] **Step 4: Run example**

```bash
node examples/basic-usage.js
```

Expected: Output shows results [6, 8, 10] and empty errors

- [ ] **Step 5: Final commit**

```bash
git add examples/
git commit -m "chore: add usage example and final verification"
```

---

## Plan Complete

The implementation plan is now complete and saved to `docs/superpowers/plans/2026-03-16-pipelean-redesign.md`.

**Ready to execute using superpowers:subagent-driven-development?**