import {test, expect} from 'vitest'
import {seriesSync, collect} from '$src/index'

test('all items succeed returns results with no errors', () => {
  const result = seriesSync([1, 2, 3], x => x * 2)
  expect(result).toEqual({results: [2, 4, 6], errors: [], failure: false})
})

test('failFast stops on first error with no partial results', () => {
  const bang = new Error('bang')
  const result = seriesSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x * 10
  }, {strategy: 'failFast'})
  expect(result.results).toEqual([])
  expect(result.failure).toEqual({item: 2, error: bang, index: 1})
  expect(result.errors).toEqual([])
})

test('collect continues past errors', () => {
  const bang = new Error('bang')
  const result = seriesSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x * 10
  }, {strategy: collect})
  expect(result.results).toEqual([10, 30])
  expect(result.errors).toEqual([{item: 2, error: bang, index: 1}])
  expect(result.failure).toBe(false)
})

test('passes index as second arg to fn', () => {
  const indices = []
  seriesSync([10, 20, 30], (_item, index) => {
    indices.push(index)
    return index
  })
  expect(indices).toEqual([0, 1, 2])
})

test('empty array returns empty result shape', () => {
  const result = seriesSync([], x => x)
  expect(result).toEqual({results: [], errors: [], failure: false})
})

test('curried form returns a function', () => {
  const fn = seriesSync(x => x * 2)
  expect(typeof fn).toBe('function')
})

test('curried form executes when called with items', () => {
  const double = seriesSync(x => x * 2)
  const result = double([1, 2, 3])
  expect(result).toEqual({results: [2, 4, 6], errors: [], failure: false})
})

test('calls onProgress after each successful item', () => {
  const progress = []
  const result = seriesSync([1, 2, 3], x => x * 10, {
    onProgress: value => progress.push(value),
  })
  expect(result.results).toEqual([10, 20, 30])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 3,
    },
    {
      item: 2, result: 20, index: 1, total: 3,
    },
    {
      item: 3, result: 30, index: 2, total: 3,
    },
  ])
})

test('onProgress uses take as planned total', () => {
  const progress = []
  const result = seriesSync([1, 2, 3, 4, 5], x => x * 10, {
    take: 2,
    onProgress: value => progress.push(value),
  })

  expect(result.results).toEqual([10, 20])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 2,
    },
    {
      item: 2, result: 20, index: 1, total: 2,
    },
  ])
})

test('onProgress uses explicit total override limited by take', () => {
  const progress = []
  const result = seriesSync([1, 2, 3, 4, 5], x => x * 10, {
    total: 10,
    take: 3,
    onProgress: value => progress.push(value),
  })

  expect(result.results).toEqual([10, 20, 30])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 3,
    },
    {
      item: 2, result: 20, index: 1, total: 3,
    },
    {
      item: 3, result: 30, index: 2, total: 3,
    },
  ])
})

test('does not call onProgress for errored items', () => {
  const progress = []
  const result = seriesSync([1, 2, 3], x => {
    if (x === 2)
      throw new Error('fail')
    return x * 10
  }, {
    strategy: 'collect',
    onProgress: value => progress.push(value),
  })
  expect(result.results).toEqual([10, 30])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 3,
    },
    {
      item: 3, result: 30, index: 2, total: 3,
    },
  ])
})

test('does not call onProgress for undefined results', () => {
  const progress = []
  const result = seriesSync([1, 2, 3], x => {
    if (x === 2)
      return undefined
    return x * 10
  }, {
    onProgress: value => progress.push(value),
  })
  expect(result.results).toEqual([10, 30])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 3,
    },
    {
      item: 3, result: 30, index: 2, total: 3,
    },
  ])
})

test('undefined result drops the item from results', () => {
  const result = seriesSync([10, 20, 30], x => {
    if (x === 20)
      return undefined
    return x * 2
  })
  expect(result.results).toEqual([20, 60])
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})

test('skip strategy ignores errors without collection', () => {
  const result = seriesSync([1, 2, 3], x => {
    if (x === 2)
      throw new Error('skip me')
    return x * 10
  }, {strategy: 'skip'})
  expect(result.results).toEqual([10, 30])
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})

test('failLate collects all errors and returns failure context', () => {
  const result = seriesSync([1, 2, 3], x => {
    if (x > 1)
      throw new Error(`Error at ${x}`)
    return x * 10
  }, {strategy: 'failLate'})
  expect(result.results).toEqual([10])
  expect(result.errors).toHaveLength(2)
  expect(result.failure).toEqual({errors: result.errors})
})

test('throw strategy throws immediately', () => {
  const bang = new Error('bang')
  expect(() => seriesSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x
  }, {strategy: 'throw'})).toThrow(bang)
})

test('take limits items processed', () => {
  const processed = []
  const result = seriesSync([1, 2, 3, 4, 5], x => {
    processed.push(x)
    return x * 2
  }, {take: 3})
  expect(result.results).toEqual([2, 4, 6])
  expect(processed).toEqual([1, 2, 3])
})

test('returns value synchronously not a promise', () => {
  const result = seriesSync([1, 2, 3], x => x * 2)
  expect(result).not.toBeInstanceOf(Promise)
})
