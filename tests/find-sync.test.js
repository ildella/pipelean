/* eslint-disable max-lines */
/* eslint-disable @stylistic/max-len, require-yield */
import {test, expect, vi} from 'vitest'
import {findSync, rethrow} from '$src/index'

const fragileSource = (values, error) => (function * () {
  for (const value of values)
    yield value
  throw error
})()

test('returns first matching item', () => {
  const result = findSync([1, 2, 3, 4], x => x > 2)

  expect(result).toEqual({
    result: 3, errors: [], sourceErrors: [], failure: false,
  })
})

test('returns no-match shape when nothing matches', () => {
  const result = findSync([1, 2, 3], x => x > 10)

  expect(result).toEqual({
    result: undefined, errors: [], sourceErrors: [], failure: false,
  })
})

test('empty array returns no-match shape', () => {
  const result = findSync([], () => true)

  expect(result).toEqual({
    result: undefined, errors: [], sourceErrors: [], failure: false,
  })
})

test('returns value synchronously not a promise', () => {
  const result = findSync([1, 2, 3], x => x > 1)

  expect(result).not.toBeInstanceOf(Promise)
})

test('stops after first matching item', () => {
  const processed = []

  const result = findSync([1, 2, 3, 4], x => {
    processed.push(x)
    return x === 2
  })

  expect(result).toEqual({
    result: 2, errors: [], sourceErrors: [], failure: false,
  })
  expect(processed).toEqual([1, 2])
})

test('does not visit later errors after a match', () => {
  const result = findSync([1, 2, 3], x => {
    if (x === 3)
      throw new Error('should not happen')
    return x === 2
  })

  expect(result).toEqual({
    result: 2, errors: [], sourceErrors: [], failure: false,
  })
})

test('passes index as second arg to predicate', () => {
  const indices = []

  findSync([10, 20, 30], (_item, index) => {
    indices.push(index)
    return false
  })

  expect(indices).toEqual([0, 1, 2])
})

test('curried form returns a function', () => {
  const fn = findSync(x => x > 2)

  expect(typeof fn).toBe('function')
})

test('curried form executes when called with items', () => {
  const findEven = findSync(x => x % 2 === 0)
  const result = findEven([1, 2, 3, 4])

  expect(result).toEqual({
    result: 2, errors: [], sourceErrors: [], failure: false,
  })
})

test('object pattern immediate form returns first matching item', () => {
  const libs = [
    {type: 'network', name: 'a'},
    {type: 'filesystem', name: 'b'},
    {type: 'filesystem', name: 'c'},
  ]

  const result = findSync(libs, {type: 'filesystem'})

  expect(result).toEqual({
    result: {type: 'filesystem', name: 'b'},
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})

test('object pattern curried form returns first matching item', () => {
  const findFilesystem = findSync({type: 'filesystem'})
  const result = findFilesystem([
    {type: 'network', name: 'a'},
    {type: 'filesystem', name: 'b'},
  ])

  expect(result).toEqual({
    result: {type: 'filesystem', name: 'b'},
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})

test('default collect continues past errors until match', () => {
  const bang = new Error('bang')

  const result = findSync([1, 2, 3], x => {
    if (x === 1)
      throw bang
    return x === 3
  })

  expect(result).toEqual({
    result: 3,
    errors: [{item: 1, error: bang, index: 0}],
    sourceErrors: [],
    failure: false,
  })
})

test('default collect returns collected errors when no item matches', () => {
  const bang = new Error('bang')

  const result = findSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return false
  })

  expect(result).toEqual({
    result: undefined,
    errors: [{item: 2, error: bang, index: 1}],
    sourceErrors: [],
    failure: false,
  })
})

test('failFast stops on first error with no collected errors', () => {
  const bang = new Error('bang')

  const result = findSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return false
  }, {strategy: 'failFast'})

  expect(result).toEqual({
    result: undefined,
    errors: [],
    sourceErrors: [],
    failure: {item: 2, error: bang, index: 1},
  })
})

test('failLate returns failure after errors before a match', () => {
  const bang = new Error('bang')

  const result = findSync([1, 2, 3], x => {
    if (x === 1)
      throw bang
    return x === 3
  }, {strategy: 'failLate'})

  expect(result).toEqual({
    result: 3,
    errors: [{item: 1, error: bang, index: 0}],
    sourceErrors: [],
    failure: {errors: result.errors},
  })
})

test('failLate stops at the first match after earlier errors', () => {
  const bang = new Error('bang')
  const processed = []

  const result = findSync([1, 2, 3, 4], x => {
    processed.push(x)
    if (x === 1)
      throw bang
    if (x === 4)
      throw new Error('should not happen')
    return x === 3
  }, {strategy: 'failLate'})

  expect(result).toEqual({
    result: 3,
    errors: [{item: 1, error: bang, index: 0}],
    sourceErrors: [],
    failure: {errors: result.errors},
  })
  expect(processed).toEqual([1, 2, 3])
})

test('skip ignores errors and continues until match', () => {
  const result = findSync([1, 2, 3], x => {
    if (x === 1)
      throw new Error('skip me')
    return x === 3
  }, {strategy: 'skip'})

  expect(result).toEqual({
    result: 3, errors: [], sourceErrors: [], failure: false,
  })
})

test('throw strategy throws immediately', () => {
  const bang = new Error('bang')

  expect(() => findSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return false
  }, {strategy: 'throw'})).toThrow(bang)
})

test('take limits items processed', () => {
  const processed = []

  const result = findSync([1, 2, 3, 4], x => {
    processed.push(x)
    return x === 4
  }, {take: 2})

  expect(result).toEqual({
    result: undefined, errors: [], sourceErrors: [], failure: false,
  })
  expect(processed).toEqual([1, 2])
})

test('onError receives error context with total', () => {
  const bang = new Error('bang')
  const errors = []

  findSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return false
  }, {
    onError: value => errors.push(value),
  })

  expect(errors).toEqual([
    {
      item: 2, error: bang, index: 1, total: 3,
    },
  ])
})

test('onError uses take as planned total', () => {
  const bang = new Error('bang')
  const errors = []

  findSync([1, 2, 3, 4], x => {
    if (x === 2)
      throw bang
    return false
  }, {
    take: 2,
    onError: value => errors.push(value),
  })

  expect(errors).toEqual([
    {
      item: 2, error: bang, index: 1, total: 2,
    },
  ])
})

test('failFast calls onFailure immediately', () => {
  const bang = new Error('bang')
  const failures = []

  const result = findSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return false
  }, {
    strategy: 'failFast',
    onFailure: value => failures.push(value),
  })

  expect(result.failure).toEqual({item: 2, error: bang, index: 1})
  expect(failures).toEqual([{item: 2, error: bang, index: 1}])
})

test('failLate calls onFailure after no-match loop completes', () => {
  const bang = new Error('bang')
  const failures = []

  const result = findSync([1, 2, 3], x => {
    if (x === 2)
      throw bang
    return false
  }, {
    strategy: 'failLate',
    onFailure: value => failures.push(value),
  })

  expect(result.failure).toEqual({errors: result.errors})
  expect(failures).toEqual([{errors: result.errors}])
})

test('throw strategy does not call onError or onFailure', () => {
  const bang = new Error('bang')
  const errors = []
  const failures = []

  expect(() => findSync([1], () => {
    throw bang
  }, {
    strategy: 'throw',
    onError: value => errors.push(value),
    onFailure: value => failures.push(value),
  })).toThrow(bang)

  expect(errors).toEqual([])
  expect(failures).toEqual([])
})

test('collect: source death records sourceErrors with no match', () => {
  const boom = new Error('find source died')
  const items = fragileSource([1, 2], boom)

  const result = findSync(items, () => false, {strategy: 'collect'})

  expect(result).toEqual({
    result: undefined,
    errors: [],
    sourceErrors: [{error: boom, index: 2}],
    failure: false,
  })
})

test('failFast: source failure stops the run and calls callbacks once', () => {
  const boom = new Error('find failed fast')
  const items = fragileSource([1, 2], boom)
  const onFailure = vi.fn()
  const onSourceError = vi.fn()

  const result = findSync(items, () => false, {
    strategy: 'failFast',
    onFailure,
    onSourceError,
  })

  expect(result).toEqual({
    result: undefined,
    errors: [],
    sourceErrors: [{error: boom, index: 2}],
    failure: {error: boom, index: 2},
  })
  expect(onFailure).toHaveBeenCalledTimes(1)
  expect(onFailure).toHaveBeenCalledWith({error: boom, index: 2})
  expect(onSourceError).toHaveBeenCalledTimes(1)
  expect(onSourceError).toHaveBeenCalledWith({error: boom, index: 2})
})

test('failLate: item errors and source errors merge in order', () => {
  const opError = new Error('predicate failed')
  const srcError = new Error('source died late')
  const gen = function * () {
    yield 1
    yield 2
    throw srcError
  }

  const result = findSync(gen(), x => {
    if (x === 1)
      throw opError
    return false
  }, {strategy: 'failLate'})

  expect(result.result).toBeUndefined()
  expect(result.errors).toEqual([{item: 1, error: opError, index: 0}])
  expect(result.sourceErrors).toEqual([{error: srcError, index: 2}])
  expect(result.failure).toEqual({
    errors: [...result.errors, ...result.sourceErrors],
  })
})

test('skip: source errors are ignored but onSourceError still fires', () => {
  const boom = new Error('skipped find death')
  const items = fragileSource([1, 2], boom)
  const onSourceError = vi.fn()

  const result = findSync(items, () => false, {
    strategy: 'skip',
    onSourceError,
  })

  expect(result).toEqual({
    result: undefined,
    errors: [],
    sourceErrors: [],
    failure: false,
  })
  expect(onSourceError).toHaveBeenCalledTimes(1)
  expect(onSourceError).toHaveBeenCalledWith({error: boom, index: 2})
})

test('throw strategy propagates the source error without onSourceError', () => {
  const boom = new Error('raw find throw')
  const onSourceError = vi.fn()
  const items = fragileSource([1], boom)

  expect(() => findSync(items, () => false, {
    strategy: 'throw',
    onSourceError,
  })).toThrow(boom)
  expect(onSourceError).not.toHaveBeenCalled()
})

test('rethrow strategy propagates the source error without onSourceError', () => {
  const boom = new Error('raw find rethrow')
  const onSourceError = vi.fn()
  const items = fragileSource([1], boom)

  expect(() => findSync(items, () => false, {
    strategy: rethrow,
    onSourceError,
  })).toThrow(boom)
  expect(onSourceError).not.toHaveBeenCalled()
})

test('a match before the death returns normally with no source errors', () => {
  const boom = new Error('should not be reached')
  const items = fragileSource([1, 2], boom)

  const result = findSync(items, x => x === 2)

  expect(result).toEqual({
    result: 2,
    errors: [],
    sourceErrors: [],
    failure: false,
  })
})

test('take reached before the throw records no source error and closes', () => {
  const boom = new Error('never reached')
  let returned = false
  const gen = function * () {
    try {
      yield 1
      yield 2
      yield 3
      throw boom
    } finally {
      returned = true
    }
  }

  const result = findSync(gen(), () => false, {take: 2})

  expect(result).toEqual({
    result: undefined,
    errors: [],
    sourceErrors: [],
    failure: false,
  })
  expect(returned).toBe(true)
})

test('source throwing before the first item reports index 0', () => {
  const boom = new Error('never yielded')
  const gen = function * () {
    throw boom
  }

  const result = findSync(gen(), () => false, {strategy: 'collect'})

  expect(result).toEqual({
    result: undefined,
    errors: [],
    sourceErrors: [{error: boom, index: 0}],
    failure: false,
  })
})
