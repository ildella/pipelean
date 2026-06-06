import {test, expect, vi} from 'vitest'
import {
  failFast, failLate, flow,
} from '$src/functional'

test('onError callback receives normalized shape with total', async () => {
  const onError = vi.fn()

  await flow([
    () => ({a: 1}),
    () => {
      throw new Error('e')
    },
    () => ({b: 2}),
  ], {onError})({})

  expect(onError).toHaveBeenCalledOnce()
  const ctx = onError.mock.calls[0][0]
  expect(ctx.operation).toBe('operation-1')
  expect(ctx.error).toBeInstanceOf(Error)
  expect(ctx.index).toBe(1)
  expect(ctx.total).toBe(3)
})

test('onFailure callback (failFast) receives normalized shape', async () => {
  const onFailure = vi.fn()

  await flow([
    function stepOne () {
      throw new Error('fail')
    },
  ], {strategy: failFast, onFailure})({})

  expect(onFailure).toHaveBeenCalledOnce()
  const ctx = onFailure.mock.calls[0][0]
  expect(ctx.operation).toBe('stepOne')
  expect(ctx.error).toBeInstanceOf(Error)
  expect(ctx.index).toBe(0)
})

test('onFailure callback (failLate) shape is normalized', async () => {
  const onFailure = vi.fn()

  await flow([
    () => {
      throw new Error('e1')
    },
    () => {
      throw new Error('e2')
    },
  ], {strategy: failLate, onFailure})({})

  expect(onFailure).toHaveBeenCalledOnce()
  const ctx = onFailure.mock.calls[0][0]
  expect(ctx.errors).toHaveLength(2)
  expect(ctx.errors[0].operation).toBe('operation-0')
  expect(ctx.errors[1].operation).toBe('operation-1')
})
