import {test, expect, vi} from 'vitest'
import {collect, mapSeries, rethrow} from '$src/index'

const captureError = async fn => {
  try {
    await fn()
  } catch (error) {
    return error
  }

  return undefined
}

test('returns a bare array of results', async () => {
  const result = await mapSeries([1, 2, 3], x => Promise.resolve(x * 2))

  expect(result).toEqual([2, 4, 6])
})

test('maps sequentially in source order', async () => {
  const seen = []

  const result = await mapSeries([1, 2, 3], async x => {
    seen.push(`start:${x}`)
    await Promise.resolve()
    seen.push(`end:${x}`)
    return x * 10
  })

  expect(result).toEqual([10, 20, 30])
  expect(seen).toEqual([
    'start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3',
  ])
})

test('rejects with the original error on the first failure', async () => {
  const bang = new Error('bang')
  const mapper = x => {
    if (x === 2)
      throw bang
    return Promise.resolve(x)
  }

  const error = await captureError(() => mapSeries([1, 2, 3], mapper))

  expect(error).toBe(bang)
})

test('stops at the first failure', async () => {
  const seen = []
  const mapper = x => {
    seen.push(x)
    if (x === 2)
      throw new Error('bang')
    return Promise.resolve(x)
  }

  await captureError(() => mapSeries([1, 2, 3], mapper))

  expect(seen).toEqual([1, 2])
})

test('curried form is reusable', async () => {
  const double = mapSeries(x => Promise.resolve(x * 2))

  await expect(double([1, 2])).resolves.toEqual([2, 4])
  await expect(double([3])).resolves.toEqual([6])
})

test('passes take and onProgress through untouched', async () => {
  const progress = []

  const result = await mapSeries([1, 2, 3, 4], x => Promise.resolve(x * 10), {
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

test('passes pause through untouched', async () => {
  const start = Date.now()

  const result = await mapSeries([1], x => Promise.resolve(x), {pause: 5})
  const elapsed = Date.now() - start

  expect(result).toEqual([1])
  expect(elapsed).toBeGreaterThanOrEqual(4)
})

test('honors a mid-run abort and resolves the partial results', async () => {
  const controller = new AbortController()

  const result = await mapSeries([1, 2, 3], x => Promise.resolve(x * 10), {
    signal: controller.signal,
    onProgress: ({index}) => {
      if (index === 0)
        controller.abort()
    },
  })

  expect(result).toEqual([10])
})

test('an already-aborted signal resolves to an empty array', async () => {
  const controller = new AbortController()
  controller.abort()

  const mapper = vi.fn(x => Promise.resolve(x))
  const result = await mapSeries([1, 2, 3], mapper, {
    signal: controller.signal,
  })

  expect(result).toEqual([])
  expect(mapper).not.toHaveBeenCalled()
})

test('rejects a conflicting strategy at build time', () => {
  expect(() => mapSeries(x => Promise.resolve(x), {strategy: collect}))
    .toThrow(TypeError)
})

test('rejects a conflicting strategy instead of overriding it', () => {
  expect(() => mapSeries([1, 2], x => Promise.resolve(x), {
    strategy: 'collect',
  })).toThrow(TypeError)
})

test('accepts the rethrow object', async () => {
  await expect(mapSeries(
    [1, 2], x => Promise.resolve(x), {strategy: rethrow},
  )).resolves.toEqual([1, 2])
})

test('accepts the throw string literal', async () => {
  await expect(mapSeries(
    [1, 2], x => Promise.resolve(x), {strategy: 'throw'},
  )).resolves.toEqual([1, 2])
})

test('drops items whose mapper returns undefined', async () => {
  const result = await mapSeries(
    [1, 2, 3],
    x => Promise.resolve(x === 2 ? undefined : x * 2),
  )

  expect(result).toEqual([2, 6])
})

test('consumes an async iterable source', async () => {
  async function * pages () {
    yield 1
    yield 2
  }

  const result = await mapSeries(pages(), x => Promise.resolve(x * 10))

  expect(result).toEqual([10, 20])
})

test('empty input returns an empty array', async () => {
  await expect(mapSeries([], x => Promise.resolve(x))).resolves.toEqual([])
})

test('rejects a null strategy with the intended configuration error', () => {
  expect(() => mapSeries([1], x => Promise.resolve(x), {strategy: null}))
    .toThrow(
      'mapSeries() always rethrows on the first error; ' +
      'remove the "null" strategy',
    )
})

test.each(['onError', 'onFailure', 'onSourceError'])(
  'rejects the dead %s callback at build time',
  key => {
    expect(() => mapSeries(x => Promise.resolve(x), {[key]: () => undefined}))
      .toThrow(TypeError)
  },
)

test.each(['onError', 'onFailure', 'onSourceError'])(
  'rejects the dead %s callback on the immediate form',
  key => {
    expect(() => mapSeries([1], x => Promise.resolve(x), {
      [key]: () => undefined,
    })).toThrow(/never fire/)
  },
)

test('still accepts onProgress under the locked rethrow', async () => {
  const onProgress = vi.fn()

  const result = await mapSeries([1, 2], x => Promise.resolve(x * 2), {
    onProgress,
  })

  expect(result).toEqual([2, 4])
  expect(onProgress).toHaveBeenCalledTimes(2)
})
