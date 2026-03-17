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

  // Start execution
  const promise = retryFn()

  // Allow first attempt to fail (flush microtasks)
  await Promise.resolve()
  // At this point, the delay should have started
  expect(fn).toHaveBeenCalledTimes(1)

  // Advance time by 1000ms
  await vi.advanceTimersByTimeAsync(1000)

  // Now the second attempt should run
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

  // Use Promise.all to attach the assertion handler immediately
  // while also advancing the timers.
  await Promise.all([
    vi.advanceTimersByTimeAsync(200),
    expect(promise).rejects.toThrow('fail'),
  ])

  vi.useRealTimers()
})
