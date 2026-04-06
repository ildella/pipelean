import {test, expect} from 'vitest'
import {series, collect} from '$src/functional'

test('all items succeed returns results with no errors', async () => {
  const result = await series([1, 2, 3], x => x * 2)
  expect(result).toEqual({results: [2, 4, 6], errors: [], failure: false})
})

test('failFast stops on first error with partial results', async () => {
  const bang = new Error('bang')
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x * 10
  }, {strategy: 'failFast'})
  expect(result.results).toEqual([10])
  expect(result.failure).toEqual({item: 2, error: bang})
  expect(result.errors).toEqual([])
})

test('collect continues past errors same as skip', async () => {
  const bang = new Error('bang')
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x * 10
  }, {strategy: collect})
  expect(result.results).toEqual([10, 30])
  expect(result.errors).toEqual([{item: 2, error: bang}])
  expect(result.failure).toBe(false)
})

test('async mapping functions work', async () => {
  const result = await series([1, 2], x => Promise.resolve(x + 100))
  expect(result.results).toEqual([101, 102])
})

test('passes index as second arg to fn', async () => {
  const indices = []
  await series([10, 20, 30], (_item, index) => {
    indices.push(index)
    return index
  })
  expect(indices).toEqual([0, 1, 2])
})

test('empty array returns empty result shape', async () => {
  const result = await series([], x => x)
  expect(result).toEqual({results: [], errors: [], failure: false})
})

test('curried form returns a function', () => {
  const fn = series(x => x * 2)
  expect(typeof fn).toBe('function')
})

test('curried form executes when called with items', async () => {
  const double = series(x => x * 2)
  const result = await double([1, 2, 3])
  expect(result).toEqual({results: [2, 4, 6], errors: [], failure: false})
})

test('series with throttle waits between successful items', async () => {
  const start = Date.now()
  const result = await series([1, 2, 3], x => x * 2, {throttle: 10})
  const elapsed = Date.now() - start
  expect(result.results).toEqual([2, 4, 6])
  expect(result.errors).toEqual([])
  // Should take at least 20ms (2 delays of 10ms each)
  expect(elapsed).toBeGreaterThanOrEqual(20)
})

test('series with throttle does NOT wait after errors by default', async () => {
  const start = Date.now()
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      throw new Error('fail')
    return x * 2
  }, {throttle: 10, strategy: 'collect'})
  const elapsed = Date.now() - start
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(1)
  // Should take at least 10ms (only 1 delay, error at 2 skips throttle)
  expect(elapsed).toBeGreaterThanOrEqual(10)
  // And less than 25ms (no second delay, allowing some system overhead)
  expect(elapsed).toBeLessThan(25)
})

test('series with throttleOnErrors waits after errors too', async () => {
  const start = Date.now()
  const result = await series([1, 2, 3], x => {
    if (x === 2)
      throw new Error('fail')
    return x * 2
  }, {throttle: 10, throttleOnErrors: true, strategy: 'collect'})
  const elapsed = Date.now() - start
  expect(result.results).toEqual([2, 6])
  expect(result.errors).toHaveLength(1)
  // Should take at least 20ms (2 delays - after all items including errors)
  expect(elapsed).toBeGreaterThanOrEqual(20)
})

test(
  'series with throttle and skip strategy applies throttle after skip',
  async () => {
    const start = Date.now()
    const result = await series([1, 2, 3], x => {
      if (x === 2)
        throw new Error('fail')
      return x * 2
    }, {throttle: 10, strategy: 'skip'})
    const elapsed = Date.now() - start
    expect(result.results).toEqual([2, 6])
    expect(result.errors).toEqual([]) // skip doesn't collect errors
    // Should take at least 20ms (2 delays - maintain spacing)
    expect(elapsed).toBeGreaterThanOrEqual(20)
  },
)

test(
  'series with throttle and failFast does NOT throttle after final error',
  async () => {
    const start = Date.now()
    const result = await series([1, 2, 3], x => {
      if (x === 2)
        throw new Error('fail')
      return x * 2
    }, {throttle: 10, strategy: 'failFast'})
    const elapsed = Date.now() - start
    expect(result.results).toEqual([2])
    expect(result.failure).toBeTruthy()
    // Should take at least 10ms (1 delay after item 1, then stops)
    expect(elapsed).toBeGreaterThanOrEqual(10)
    // And less than 20ms (no second delay after error)
    expect(elapsed).toBeLessThan(20)
  },
)

test('series with throttle works with take option', async () => {
  const start = Date.now()
  const result = await series(
    [1, 2, 3, 4, 5],
    x => x * 2,
    {throttle: 10, take: 3},
  )
  const elapsed = Date.now() - start
  expect(result.results).toEqual([2, 4, 6])
  // Should take at least 20ms (2 delays for 3 items)
  expect(elapsed).toBeGreaterThanOrEqual(20)
  // And less than 35ms (only 2 delays, allowing system overhead)
  expect(elapsed).toBeLessThan(35)
})

test('series with no throttle runs immediately', async () => {
  const result = await series([1, 2, 3], x => x * 2)
  expect(result.results).toEqual([2, 4, 6])
})

test('series with zero throttle runs immediately', async () => {
  const result = await series([1, 2, 3], x => x * 2, {throttle: 0})
  expect(result.results).toEqual([2, 4, 6])
})
