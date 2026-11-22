import {test, expect, vi} from 'vitest'
import {collect, mapSeriesSync, rethrow} from '$src/index'

const captureError = fn => {
  try {
    fn()
  } catch (error) {
    return error
  }

  return undefined
}

test('returns a bare array of results', () => {
  const result = mapSeriesSync([1, 2, 3], x => x * 2)

  expect(result).toEqual([2, 4, 6])
})

test('maps sequentially in source order', () => {
  const seen = []

  const result = mapSeriesSync([1, 2, 3], x => {
    seen.push(x)
    return x * 10
  })

  expect(result).toEqual([10, 20, 30])
  expect(seen).toEqual([1, 2, 3])
})

test('throws the original error on the first failure', () => {
  const bang = new Error('bang')

  const error = captureError(() => mapSeriesSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return x
  }))

  expect(error).toBe(bang)
})

test('stops at the first failure', () => {
  const seen = []

  captureError(() => mapSeriesSync([1, 2, 3], x => {
    seen.push(x)
    if (x === 2)
      throw new Error('bang')
    return x
  }))

  expect(seen).toEqual([1, 2])
})

test('curried form is reusable', () => {
  const double = mapSeriesSync(x => x * 2)

  expect(double([1, 2])).toEqual([2, 4])
  expect(double([3])).toEqual([6])
})

test('passes take and onProgress through untouched', () => {
  const progress = []

  const result = mapSeriesSync([1, 2, 3, 4], x => x * 10, {
    take: 2,
    onProgress: value => progress.push(value),
  })

  expect(result).toEqual([10, 20])
  expect(progress).toEqual([
    {
      item: 1, result: 10, index: 0, total: 2,
    },
    {
      item: 2, result: 20, index: 1, total: 2,
    },
  ])
})

test('rejects a conflicting strategy at build time', () => {
  expect(() => mapSeriesSync(x => x, {strategy: collect})).toThrow(TypeError)
})

test('rejects a conflicting strategy instead of overriding it', () => {
  expect(() => mapSeriesSync([1, 2], x => x, {strategy: 'collect'}))
    .toThrow(TypeError)
})

test('accepts the rethrow object', () => {
  expect(mapSeriesSync([1, 2], x => x, {strategy: rethrow})).toEqual([1, 2])
})

test('accepts the throw string literal', () => {
  expect(mapSeriesSync([1, 2], x => x, {strategy: 'throw'})).toEqual([1, 2])
})

test('drops items whose mapper returns undefined', () => {
  const result = mapSeriesSync([1, 2, 3], x => x === 2 ? undefined : x * 2)

  expect(result).toEqual([2, 6])
})

test('empty input returns an empty array', () => {
  expect(mapSeriesSync([], x => x)).toEqual([])
})

test('does not call onError under the locked rethrow', () => {
  const onError = vi.fn()

  captureError(() => mapSeriesSync([1], () => {
    throw new Error('bang')
  }, {onError}))

  expect(onError).not.toHaveBeenCalled()
})
