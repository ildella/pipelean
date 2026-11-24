import {test, expect, vi} from 'vitest'
import {
  assign, collect, drop, enrich, filter, join, mapSeries, pipe, reduce,
  scan, series, tryCatch, where,
} from '$src/index'

const captureError = async fn => {
  try {
    await fn()
  } catch (error) {
    return error
  }

  return undefined
}

test('drop is the registered pipelean symbol', () => {
  expect(typeof drop).toBe('symbol')
  expect(drop).toBe(Symbol.for('pipelean.drop'))
})

test('series drops a drop result without reporting onProgress', async () => {
  const onProgress = vi.fn()

  const result = await series(
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

test('series still drops undefined by default', async () => {
  const onProgress = vi.fn()

  const result = await series(
    [1, 2, 3],
    x => x === 2 ? undefined : x,
    {onProgress},
  )

  expect(result.results).toEqual([1, 3])
  expect(onProgress).toHaveBeenCalledTimes(2)
})

test('mapSeries drops a drop result', async () => {
  const result = await mapSeries([1, 2, 3], x => x === 2 ? drop : x)

  expect(result).toEqual([1, 3])
})

test('onUndefined error makes an undefined mapper fatal', async () => {
  const onError = vi.fn()
  const onFailure = vi.fn()
  const onSourceError = vi.fn()

  const error = await captureError(() => series(
    [1, 2],
    x => x === 2 ? undefined : x,
    {
      strategy: collect,
      onError,
      onFailure,
      onSourceError,
      onUndefined: 'error',
    },
  ))

  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toMatch(/series\(\) mapper returned undefined/)
  expect(onError).not.toHaveBeenCalled()
  expect(onFailure).not.toHaveBeenCalled()
  expect(onSourceError).not.toHaveBeenCalled()
})

test('onUndefined \'error\' still lets drop drop the item', async () => {
  const result = await series(
    [1, 2, 3],
    x => x === 2 ? drop : x,
    {onUndefined: 'error'},
  )

  expect(result.results).toEqual([1, 3])
  expect(result.errors).toEqual([])
})

test('mapSeries inherits the fatal undefined policy', async () => {
  const error = await captureError(() =>
    mapSeries([1], () => undefined, {onUndefined: 'error'}))

  expect(error).toBeInstanceOf(TypeError)
  expect(error.message).toMatch(/series\(\) mapper returned undefined/)
})

test('an invalid onUndefined value is rejected eagerly', () => {
  expect(() => series([1], x => x, {onUndefined: 'keep'}))
    .toThrow(TypeError)
  expect(() => series([1], x => x, {onUndefined: 'keep'}))
    .toThrow(/onUndefined must be 'drop' or 'error'/)
})

test('pipe short-circuits on a drop step, keeping the sentinel', async () => {
  const calls = []

  const result = await pipe(
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

test('pipe short-circuits on a drop input without running a step', async () => {
  const step = vi.fn()

  const result = await pipe(step)(drop)

  expect(result).toBe(drop)
  expect(step).not.toHaveBeenCalled()
})

test('pipe keeps short-circuiting on undefined in 0.18', async () => {
  const step = vi.fn()

  const result = await pipe(() => undefined, step)(1)

  expect(result).toBeUndefined()
  expect(step).not.toHaveBeenCalled()
})

test('filter treats drop and undefined predicates as exclusion', async () => {
  const result = await filter([1, 2, 3, 4], x => {
    if (x === 1)
      return drop
    if (x === 2)
      return undefined
    return x > 2
  })

  expect(result.results).toEqual([3, 4])
  expect(result.errors).toEqual([])
})

test('where does not match a drop item', () => {
  expect(where({a: 1})(drop)).toBe(false)
  expect(where({a: 1})({a: 1})).toBe(true)
})

test('assign treats a drop parse as a no-op patch', () => {
  const step = assign('value', () => drop)

  expect(step({})).toEqual({})
})

test('enrich rejects a drop patch as a step error', async () => {
  const result = await enrich([
    () => drop,
    () => ({kept: true}),
  ])({})

  expect(result.value).toEqual({kept: true})
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].error).toBeInstanceOf(TypeError)
  expect(result.errors[0].error.message)
    .toMatch(/enrich steps cannot drop; return \{\} for a no-op/)
})

test('scan and reduce keep drop as an ordinary accumulator value', async () => {
  const scanResult = await scan([1], () => drop, 0)
  const reduceResult = await reduce([1], () => drop, 0)

  expect(scanResult.results).toEqual([drop])
  expect(reduceResult.value).toBe(drop)
})

test('join keeps a drop branch as an ordinary resolved value', async () => {
  const result = await join({kept: () => 'value', dropped: () => drop})

  expect(result.value).toEqual({kept: 'value', dropped: drop})
  expect(result.errors).toEqual([])
})

test('tryCatch recover can return drop inside series', async () => {
  const wrapped = tryCatch(
    () => {
      throw new Error('boom')
    },
    {recover: () => drop},
  )

  const result = await series([1, 2], wrapped)

  expect(result.results).toEqual([])
  expect(result.errors).toEqual([])
})

test('tryCatch recover can return drop inside pipe', async () => {
  const wrapped = tryCatch(
    () => {
      throw new Error('boom')
    },
    {recover: () => drop},
  )

  const result = await pipe(wrapped, x => x)(1)

  expect(result).toBe(drop)
})
