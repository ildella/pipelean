import {test, expect, vi} from 'vitest'
import {enrichSync, failLate, skip} from '$src/index'

test('a throwing start hook under failLate records and keeps going', () => {
  const error = new Error('start hook')
  const started = []
  const second = vi.fn(() => ({b: 2}))
  const onStepStart = vi
    .fn()
    .mockImplementationOnce(() => {
      throw error
    })
    .mockImplementation(({index}) => started.push(index))

  const result = enrichSync([() => ({a: 1}), second], {
    strategy: failLate,
    onStepStart,
  })({})

  expect(started).toEqual([1])
  expect(second).toHaveBeenCalledOnce()
  expect(result.value).toEqual({b: 2})
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0].operation).toBe('operation-0')
  expect(result.errors[0].error).toBe(error)
  expect(result.failure.errors).toHaveLength(1)
  expect(result.failure.errors[0].error).toBe(error)
})

test('a throwing success hook under skip is dropped and runs on', () => {
  const error = new Error('success hook')
  const succeeded = []
  const onStepSuccess = vi
    .fn()
    .mockImplementationOnce(() => {
      throw error
    })
    .mockImplementation(({index}) => succeeded.push(index))

  const result = enrichSync([
    () => ({a: 1}),
    () => ({b: 2}),
  ], {strategy: skip, onStepSuccess})({})

  expect(succeeded).toEqual([1])
  expect(onStepSuccess).toHaveBeenCalledTimes(2)
  // The skipped step's patch is not committed, but the run goes on.
  expect(result.value).toEqual({b: 2})
  expect(result.errors).toEqual([])
  expect(result.failure).toBe(false)
})
