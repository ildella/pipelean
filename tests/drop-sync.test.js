import {test, expect, vi} from 'vitest'
import {
  collect, drop, enrichSync, filterSync, findSync, foldSync, mapSeriesSync,
  pipeSync, reduceSync, scanSync, seriesSync, tryCatchSync,
} from '$src/index'

test('seriesSync drops a drop result without reporting onProgress', () => {
  const onProgress = vi.fn()

  const result = seriesSync(
    [1, 2, 3],
    x => x === 2 ? drop : x * 10,
    {onProgress},
  )

  expect(result.results).toEqual([10, 30])
  expect(result.errors).toEqual([])
  expect(onProgress).toHaveBeenCalledTimes(2)
  expect(onProgress.mock.calls.map(([context]) => context.item))
    .toEqual([1, 3])
})

test('seriesSync still drops undefined by default', () => {
  const result = seriesSync([1, 2, 3], x => x === 2 ? undefined : x)

  expect(result.results).toEqual([1, 3])
})

test('mapSeriesSync drops a drop result', () => {
  const result = mapSeriesSync([1, 2, 3], x => x === 2 ? drop : x)

  expect(result).toEqual([1, 3])
})

test('seriesSync onUndefined \'error\' is fatal and never collected', () => {
  const onError = vi.fn()
  const onFailure = vi.fn()

  const call = () => seriesSync(
    [1],
    () => undefined,
    {
      strategy: collect, onError, onFailure, onUndefined: 'error',
    },
  )

  expect(call).toThrow(TypeError)
  expect(call).toThrow(/seriesSync\(\) mapper returned undefined/)
  expect(onError).not.toHaveBeenCalled()
  expect(onFailure).not.toHaveBeenCalled()
})

test('seriesSync onUndefined \'error\' still lets drop drop the item', () => {
  const result = seriesSync(
    [1, 2, 3],
    x => x === 2 ? drop : x,
    {onUndefined: 'error'},
  )

  expect(result.results).toEqual([1, 3])
  expect(result.errors).toEqual([])
})

test('mapSeriesSync inherits the fatal undefined policy', () => {
  expect(() =>
    mapSeriesSync([1], () => undefined, {onUndefined: 'error'}))
    .toThrow(/seriesSync\(\) mapper returned undefined/)
})

test('an invalid onUndefined value is rejected eagerly', () => {
  expect(() => seriesSync([1], x => x, {onUndefined: 'keep'}))
    .toThrow(/onUndefined must be 'drop' or 'error'/)
})

test('pipeSync short-circuits on drop and keeps the sentinel', () => {
  const calls = []

  const result = pipeSync(
    x => {
      calls.push('first')
      expect(x).toBe(1)
      return drop
    },
    x => {
      calls.push('second')
      return x
    },
  )(1)

  expect(result).toBe(drop)
  expect(calls).toEqual(['first'])
})

test('pipeSync short-circuits on a drop input', () => {
  const step = vi.fn()

  const result = pipeSync(step)(drop)

  expect(result).toBe(drop)
  expect(step).not.toHaveBeenCalled()
})

test('pipeSync keeps short-circuiting on undefined in 0.18', () => {
  const step = vi.fn()

  const result = pipeSync(() => undefined, step)(1)

  expect(result).toBeUndefined()
  expect(step).not.toHaveBeenCalled()
})

test('filterSync treats drop and undefined predicates as exclusion', () => {
  const result = filterSync([1, 2, 3, 4], x => {
    if (x === 1)
      return drop
    if (x === 2)
      return undefined
    return x > 2
  })

  expect(result.results).toEqual([3, 4])
  expect(result.errors).toEqual([])
})

test('findSync treats a drop predicate as no match', () => {
  const result = findSync([1, 2], () => drop)

  expect(result.value).toBeUndefined()
  expect(result.errors).toEqual([])
})

test('findSync still finds a truthy match', () => {
  const result = findSync([1, 2, 3], x => x === 2)

  expect(result.value).toBe(2)
})

test('enrichSync rejects a drop patch as a step error', () => {
  const result = enrichSync([
    () => drop,
    () => ({kept: true}),
  ])({})

  expect(result.value).toEqual({kept: true})
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].error).toBeInstanceOf(TypeError)
  expect(result.errors[0].error.message)
    .toMatch(/enrich steps cannot drop; return \{\} for a no-op/)
})

test('scanSync and reduceSync keep drop as an accumulator value', () => {
  const scanResult = scanSync([1], () => drop, 0)
  const reduceResult = reduceSync([1], () => drop, 0)

  expect(scanResult.results).toEqual([drop])
  expect(reduceResult.value).toBe(drop)
})

test('foldSync keeps drop as an accumulator value', () => {
  expect(foldSync([1, 2], () => drop, 0)).toBe(drop)
})

test('tryCatchSync recover can return drop inside seriesSync', () => {
  const wrapped = tryCatchSync(
    () => {
      throw new Error('boom')
    },
    {recover: () => drop},
  )

  const result = seriesSync([1, 2], wrapped)

  expect(result.results).toEqual([])
  expect(result.errors).toEqual([])
})

test('tryCatchSync recover can return drop inside pipeSync', () => {
  const wrapped = tryCatchSync(
    () => {
      throw new Error('boom')
    },
    {recover: () => drop},
  )

  expect(pipeSync(wrapped, x => x)(1)).toBe(drop)
})
