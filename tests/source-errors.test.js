import {
  scan, filter, failFast, collect,
} from '../src/functional.js'
import {seriesSync, scanSync} from '../src/functional-sync.js'
import {
  fragileGeneratorSync,
} from './source-errors-helpers'

describe('scan() with async generator source errors', () => {
  test.fails('collect strategy: preserves partial accumulators, captures sourceError', async () => {
    async function * gen () {
      yield 10
      yield 20
      throw new Error('source error')
      yield 30
    }

    const {
      results, errors, sourceErrors, failure, value,
    } = await scan(
      gen(),
      (acc, item) => acc + item,
      0,
      {strategy: collect, storePartialResults: true}
    )

    expect(results).toEqual([10, 30]) // accumulators after each successful item
    expect(value).toBeUndefined() // storePartialResults: true does not return value
    expect(errors).toEqual([])
    expect(sourceErrors).toHaveLength(1)
    expect(sourceErrors[0].index).toBe(2)
  })

  test.fails('reduce mode (storePartialResults: false): returns last known accumulator', async () => {
    async function * gen () {
      yield 10
      yield 20
      throw new Error('source error')
      yield 30
    }

    const {
      results, value, errors, sourceErrors,
    } = await scan(
      gen(),
      (acc, item) => acc + item,
      0,
      {strategy: collect, storePartialResults: false}
    )

    expect(results).toBeUndefined() // not stored
    expect(value).toBe(30) // 0 + 10 + 20 = 30
    expect(sourceErrors).toHaveLength(1)
  })

  test.fails('failFast strategy: returns empty results but preserves last accumulator', async () => {
    async function * gen () {
      yield 10
      yield 20
      throw new Error('source error')
    }

    const {
      results, value, errors, sourceErrors, failure,
    } = await scan(
      gen(),
      (acc, item) => acc + item,
      0,
      {strategy: failFast, storePartialResults: false}
    )

    expect(results).toBeUndefined()
    expect(value).toBe(30) // accumulated value before source died
    expect(sourceErrors).toHaveLength(1)
    expect(failure.index).toBe(2)
  })
})

describe('filter() with async generator source errors', () => {
  test.fails('collect strategy: filters what it can, captures sourceError separately', async () => {
    async function * gen () {
      yield {active: true, id: 1}
      yield {active: false, id: 2}
      yield {active: true, id: 3}
      throw new Error('source error')
      yield {active: true, id: 4}
    }

    const {
      results, errors, sourceErrors, failure,
    } = await filter(
      gen(),
      item => item.active,
      {strategy: collect}
    )

    expect(results).toEqual([
      {active: true, id: 1},
      {active: true, id: 3},
    ])
    expect(errors).toEqual([]) // predicate never threw
    expect(sourceErrors).toHaveLength(1)
    expect(failure).toBe(false)
  })
})

// ============================================================================
// SYNC VARIANTS
// ============================================================================

describe('seriesSync() with generator source errors', () => {
  test.fails('collect strategy: captures sourceError in sync context', () => {
    const {
      results, errors, sourceErrors, failure,
    } = seriesSync(
      fragileGeneratorSync(),
      item => item.data.toUpperCase(),
      {strategy: collect}
    )

    expect(results).toEqual(['A'])
    expect(errors).toEqual([])
    expect(sourceErrors).toHaveLength(1)
    expect(sourceErrors[0].error.message).toBe('Sync source error at index 1')
    expect(sourceErrors[0].index).toBe(1)
    expect(failure).toBe(false)
  })

  test.fails('failFast strategy: stops immediately, clears results', () => {
    const {
      results, errors, sourceErrors, failure,
    } = seriesSync(
      fragileGeneratorSync(),
      item => item.data.toUpperCase(),
      {strategy: failFast}
    )

    expect(results).toEqual([])
    expect(sourceErrors).toHaveLength(1)
    expect(failure.error.message).toBe('Sync source error at index 1')
  })

  test.fails('triggers iterator.return() on sync generators for cleanup', () => {
    let cleanedUp = false
    function * gen () {
      try {
        yield 1
        throw new Error('bang')
      } finally {
        cleanedUp = true
      }
    }

    seriesSync(gen(), x => x, {strategy: collect})
    expect(cleanedUp).toBe(true)
  })
})

describe('scanSync() with generator source errors', () => {
  test.fails('preserves partial results and captures sourceError', () => {
    function * gen () {
      yield 10
      yield 20
      throw new Error('sync source error')
      yield 30
    }

    const {results, value, sourceErrors} = scanSync(
      gen(),
      (acc, item) => acc + item,
      0,
      {strategy: collect, storePartialResults: false}
    )

    expect(value).toBe(30)
    expect(sourceErrors).toHaveLength(1)
    expect(sourceErrors[0].index).toBe(2)
  })
})
