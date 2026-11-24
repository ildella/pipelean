import {test, expect, vi} from 'vitest'
import {
  collect, foldSync, mapSeries, reduce, rethrow, series, skip,
} from '$src/index'
import {isSyncCallbackError} from '$src/shared.js'

const MESSAGE = 'foldSync() reducer returned a Promise; use reduce()'

const asyncReducer = async (acc, item) => await acc + item

const violatesPolicy = item => foldSync([item], asyncReducer, 0)

const violatingMapper = async item => {
  await Promise.resolve()

  return item === 2 ? violatesPolicy(item) : item
}

const plainThrowingMapper = async item => {
  await Promise.resolve()

  return foldSync([item], () => {
    throw new Error(`plain ${item}`)
  }, 0)
}

test('collect records a nested sync-callback TypeError as a source error',
  async () => {
    const {results, errors, sourceErrors} = await series(
      [1, 2, 3], violatingMapper, {strategy: collect},
    )

    expect(results).toEqual([1])
    expect(errors).toEqual([])
    expect(sourceErrors).toHaveLength(1)
    expect(isSyncCallbackError(sourceErrors[0].error)).toBe(true)
    expect(sourceErrors[0].error.message).toBe(MESSAGE)
  })

test('skip aborts the run instead of swallowing the violation', async () => {
  const {results, errors, sourceErrors} = await series(
    [1, 2, 3], violatingMapper, {strategy: skip},
  )

  expect(results).toEqual([1])
  expect(errors).toEqual([])
  expect(sourceErrors).toEqual([])
})

test('mapSeries rejects with the nested sync-callback TypeError', async () => {
  let thrown
  try {
    await mapSeries([2], violatingMapper)
  } catch (error) {
    thrown = error
  }

  expect(thrown).toBeInstanceOf(TypeError)
  expect(isSyncCallbackError(thrown)).toBe(true)
  expect(thrown.message).toBe(MESSAGE)
})

test('a plain throw from a nested sync combinator is collected as data',
  async () => {
    const {results, errors, sourceErrors} = await series(
      [1, 2], plainThrowingMapper, {strategy: collect},
    )

    expect(results).toEqual([])
    expect(sourceErrors).toEqual([])
    expect(errors.map(({item, error}) => [item, error.message]))
      .toEqual([[1, 'plain 1'], [2, 'plain 2']])
  })

const violatingScanner = (acc, item) =>
  item === 2 ? violatesPolicy(item) : acc

test('async fold recover does not consume a nested sync-callback TypeError',
  async () => {
    const recover = vi.fn(({state}) => state)
    let thrown
    try {
      await reduce([1, 2], violatingScanner, 'seed', {
        strategy: rethrow, recover,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(TypeError)
    expect(isSyncCallbackError(thrown)).toBe(true)
    expect(thrown.message).toBe(MESSAGE)
    expect(recover).not.toHaveBeenCalled()
  })

test('async fold recover still handles a plain scanner error', async () => {
  const recover = vi.fn(({state}) => state)
  const {value, errors} = await reduce(
    [1, 2], (acc, item) => {
      if (item === 2)
        throw new Error('plain scan')

      return acc
    }, 'seed', {strategy: collect, recover},
  )

  expect(value).toBe('seed')
  expect(errors).toEqual([])
  expect(recover).toHaveBeenCalledTimes(1)
})
