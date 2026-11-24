import {test, expect, vi} from 'vitest'
import {retry} from '$src/functional'

test('succeeds on first attempt (default)', async () => {
  const fn = vi.fn().mockResolvedValue('ok')
  const result = await retry(fn)()
  expect(result).toBe('ok')
  expect(fn).toHaveBeenCalledTimes(1)
})

test('succeeds after retries', async () => {
  const fn = vi.fn()
    .mockRejectedValueOnce(new Error('fail 1'))
    .mockRejectedValueOnce(new Error('fail 2'))
    .mockResolvedValue('ok')

  const result = await retry(fn, {attempts: 3})()
  expect(result).toBe('ok')
  expect(fn).toHaveBeenCalledTimes(3)
})

test('throws if all attempts fail', async () => {
  const error = new Error('persistent failure')
  const fn = vi.fn().mockRejectedValue(error)

  await expect(retry(fn, {attempts: 2})()).rejects.toThrow('persistent failure')
  expect(fn).toHaveBeenCalledTimes(2)
})

test('respects delay between retries', async () => {
  vi.useFakeTimers()
  const fn = vi.fn()
    .mockRejectedValueOnce(new Error('fail'))
    .mockResolvedValue('ok')

  const retryFn = retry(fn, {attempts: 2, delay: 1000})

  const promise = retryFn()

  await Promise.resolve()
  expect(fn).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(1000)

  const result = await promise
  expect(result).toBe('ok')
  expect(fn).toHaveBeenCalledTimes(2)

  vi.useRealTimers()
})

test('does not delay after last attempt fails', async () => {
  vi.useFakeTimers()
  const fn = vi.fn().mockRejectedValue(new Error('fail'))
  const retryFn = retry(fn, {attempts: 2, delay: 200})

  const promise = retryFn()

  await Promise.all([
    vi.advanceTimersByTimeAsync(200),
    expect(promise).rejects.toThrow('fail'),
  ])

  vi.useRealTimers()
})

test('works with attempts: 1', async () => {
  const fn = vi.fn().mockResolvedValue('ok')
  const result = await retry(fn, {attempts: 1})()
  expect(result).toBe('ok')
  expect(fn).toHaveBeenCalledTimes(1)
})

test('attempts: 1 rethrows without a second call', async () => {
  const error = new Error('fail')
  const fn = vi.fn().mockRejectedValue(error)

  await expect(retry(fn, {attempts: 1})()).rejects.toThrow('fail')
  expect(fn).toHaveBeenCalledTimes(1)
})

test.each([0, -1, 1.5, NaN, Infinity, '3'])(
  'throws a TypeError at construction for attempts: %s',
  attempts => {
    expect(() => retry(() => Promise.resolve('ok'), {attempts}))
      .toThrow(new TypeError('retry() attempts must be an integer >= 1'))
  },
)

test.each([-1, NaN, Infinity, '10'])(
  'throws a TypeError at construction for delay: %s',
  delay => {
    expect(() => retry(() => Promise.resolve('ok'), {delay}))
      .toThrow(new TypeError('retry() delay must be a finite number >= 0'))
  },
)

test('throws a TypeError at construction for a non-function fn', () => {
  expect(() => retry('not a function'))
    .toThrow(new TypeError('retry() requires a function'))
})

test('does not run fn when construction fails', () => {
  const fn = vi.fn().mockResolvedValue('ok')

  expect(() => retry(fn, {attempts: 0})).toThrow(TypeError)
  expect(fn).not.toHaveBeenCalled()
})
