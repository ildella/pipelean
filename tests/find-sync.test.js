/* eslint-disable max-lines */
import {test, expect} from 'vitest'
import {findSync} from '$src/index'

test('returns first matching item', () => {
  const result = findSync([1, 2, 3, 4], x => x > 2)

  expect(result).toEqual({result: 3, errors: [], failure: false})
})

test('returns no-match shape when nothing matches', () => {
  const result = findSync([1, 2, 3], x => x > 10)

  expect(result).toEqual({result: undefined, errors: [], failure: false})
})

test('empty array returns no-match shape', () => {
  const result = findSync([], () => true)

  expect(result).toEqual({result: undefined, errors: [], failure: false})
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

  expect(result).toEqual({result: 2, errors: [], failure: false})
  expect(processed).toEqual([1, 2])
})

test('does not visit later errors after a match', () => {
  const result = findSync([1, 2, 3], x => {
    if (x === 3)
      throw new Error('should not happen')
    return x === 2
  })

  expect(result).toEqual({result: 2, errors: [], failure: false})
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

  expect(result).toEqual({result: 2, errors: [], failure: false})
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

  expect(result).toEqual({result: 3, errors: [], failure: false})
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

  expect(result).toEqual({result: undefined, errors: [], failure: false})
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
