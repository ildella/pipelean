import {test, expect} from 'vitest'
import {foldSync} from '$src/index'

const captureError = fn => {
  try {
    fn()
  } catch (error) {
    return error
  }

  return undefined
}

test('folds values and passes the index to the reducer', () => {
  const indices = []

  const total = foldSync([5, 7, 10], (acc, duration, index) => {
    indices.push(index)
    return acc + duration
  }, 0)

  expect(total).toBe(22)
  expect(indices).toEqual([0, 1, 2])
})

test('empty iterable returns the initial value', () => {
  const total = foldSync([], (acc, item) => acc + item, 42)

  expect(total).toBe(42)
})

test('folds a Set', () => {
  const total = foldSync(new Set([1, 2, 3]), (acc, item) => acc + item, 0)

  expect(total).toBe(6)
})

test('folds a sync generator', () => {
  function * numbers () {
    yield 1
    yield 2
    yield 3
  }

  const total = foldSync(numbers(), (acc, item) => acc + item, 0)

  expect(total).toBe(6)
})

test('propagates the original reducer error', () => {
  const bang = new Error('bang')

  const error = captureError(() => foldSync([1, 2, 3], () => {
    throw bang
  }, 0))

  expect(error).toBe(bang)
})

test('propagates the original iterable error', () => {
  const boom = new Error('source died')
  const source = function * () {
    yield 1
    throw boom
  }

  const error = captureError(
    () => foldSync(source(), (acc, item) => acc + item, 0),
  )

  expect(error).toBe(boom)
})

test('rejects a non-function reducer', () => {
  expect(() => foldSync([1, 2, 3], 'sum', 0)).toThrow(TypeError)
})

test('rejects a fourth argument instead of ignoring options', () => {
  expect(() => foldSync([1, 2, 3], (acc, item) => acc + item, 0, {
    strategy: 'throw',
  })).toThrow(TypeError)
})

test('rejects a fourth argument before pulling from the source', () => {
  let pulls = 0
  const source = function * () {
    pulls++
    yield 1
  }

  expect(() => foldSync(
    source(), (acc, item) => acc + item, 0, {strategy: 'throw'},
  )).toThrow(TypeError)
  expect(pulls).toBe(0)
})

test('rejects an async iterable and points at reduce()', () => {
  async function * pages () {
    yield 1
  }

  expect(() => foldSync(pages(), (acc, item) => acc + item, 0))
    .toThrow(/reduce\(\)/)
})

test('rejects a non-iterable input', () => {
  expect(() => foldSync(42, (acc, item) => acc + item, 0)).toThrow(TypeError)
})

test('keeps an undefined accumulator', () => {
  const value = foldSync([1, 2], () => undefined, 0)

  expect(value).toBeUndefined()
})

test('does not mutate the source array', () => {
  const source = [1, 2, 3]

  foldSync(source, (acc, item) => acc + item, 0)

  expect(source).toEqual([1, 2, 3])
})
