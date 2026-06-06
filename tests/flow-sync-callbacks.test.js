import {test, expect, vi} from 'vitest'
import {
  failFast, failLate, flowSync,
} from '$src/index'

test('onError callback receives normalized shape with total', () => {
  const onError = vi.fn()

  flowSync([
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

test('onFailure callback (failFast) receives normalized shape', () => {
  const onFailure = vi.fn()

  flowSync([
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

test('onFailure callback (failLate) receives normalized errors shape', () => {
  const onFailure = vi.fn()

  flowSync([
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
