import {
  test, expect, vi,
} from 'vitest'
import {
  enrichSync, failLate, filterSync, findSync, reduceSync, rethrow, scanSync,
  seriesSync,
} from '$src/index'

const boom = item => {
  if (item === 2)
    throw new Error('boom')
  return item
}

test('scanSync keeps recovered accumulators in results', () => {
  const {results, errors, failure} = scanSync([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: ({state}) => state + 10,
  })

  expect(results).toEqual([1, 11, 14])
  expect(errors).toEqual([])
  expect(failure).toBe(false)
})

test('reduceSync keeps the recovered final value', () => {
  const result = reduceSync([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: ({state}) => state * 2,
  })

  expect(result).toEqual({
    value: 5, errors: [], sourceErrors: [], failure: false,
  })
})

test('recover receives item, index, state and total synchronously', () => {
  const error = new Error('boom')
  const contexts = []

  reduceSync([1, 2, 3], (acc, item) => {
    if (item === 2)
      throw error
    return acc + item
  }, 0, {
    recover: context => {
      contexts.push(context)
      return context.state
    },
  })

  expect(contexts).toEqual([{
    error, item: 2, index: 1, state: 1, total: 3,
  }])
})

test('a throwing recover under failFast stops with the recover error', () => {
  const result = reduceSync([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'failFast',
    recover: () => {
      throw new Error('recover boom')
    },
  })

  expect(result.failure.error.message).toBe('recover boom')
  expect(result.errors).toEqual([])
})

test('a throwing recover under collect records the recover error', () => {
  const result = reduceSync([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: () => {
      throw new Error('recover boom')
    },
  })

  expect(result.errors[0].error.message).toBe('recover boom')
  expect(result.failure).toBe(false)
})

test('a throwing recover under failLate fails at the end', () => {
  const result = reduceSync([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: failLate,
    recover: () => {
      throw new Error('recover boom')
    },
  })

  expect(result.failure.errors[0].error.message).toBe('recover boom')
})

test('a throwing recover under skip is ignored', () => {
  const result = reduceSync([1, 2, 3], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'skip',
    recover: () => {
      throw new Error('recover boom')
    },
  })

  expect(result).toEqual({
    value: 4, errors: [], sourceErrors: [], failure: false,
  })
})

test('a throwing recover under rethrow rethrows the recover error', () => {
  expect(() => reduceSync([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: rethrow,
    recover: () => {
      throw new Error('recover boom')
    },
  })).toThrow('recover boom')
})

test('onError fires under rethrow when recover is present', () => {
  const onError = vi.fn()

  const {value} = reduceSync([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: rethrow,
    onError,
    recover: ({state}) => state + 1,
  })

  expect(onError).toHaveBeenCalledTimes(1)
  expect(onError.mock.calls[0][0].item).toBe(2)
  expect(value).toBe(2)
})

test('a thenable recover is rejected with a TypeError', () => {
  const result = reduceSync([1, 2], (acc, item) => {
    boom(item)
    return acc + item
  }, 0, {
    strategy: 'collect',
    recover: () => Promise.resolve(0),
  })

  expect(result.errors[0].error).toBeInstanceOf(TypeError)
  expect(result.errors[0].error.message).toMatch(/synchronous/)
})

test('a non-function recover throws a TypeError', () => {
  expect(() => scanSync([1], x => x, 0, {recover: 'nope'}))
    .toThrow(TypeError)
})

test.each([
  ['seriesSync', () => seriesSync([1], x => x, {recover: () => 0})],
  ['filterSync', () => filterSync([1], x => x, {recover: () => 0})],
  ['findSync', () => findSync([1], x => x, {recover: () => 0})],
  ['enrichSync', () => enrichSync([state => state], {recover: () => 0})],
])('%s rejects recover with a TypeError', (_name, run) => {
  expect(run).toThrow(TypeError)
})

test('sync folds still reject the async-only options', () => {
  expect(() => scanSync([1], x => x, 0, {
    recover: () => 0,
    pause: 10,
  })).toThrow(TypeError)

  expect(() => reduceSync([1], x => x, 0, {
    recover: () => 0,
    signal: new AbortController().signal,
  })).toThrow(TypeError)
})
