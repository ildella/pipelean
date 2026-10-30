/**
 * Wait `ms` milliseconds, resolving early (not rejecting) when `signal` aborts.
 *
 * The timer and the abort listener are always cleaned up, so an unbounded
 * source polled in a loop cannot accumulate listeners. An already-aborted
 * signal resolves without registering anything.
 */
export const waitWithSignal = (ms, signal) => {
  if (!signal)
    return new Promise(resolve => setTimeout(resolve, ms))

  if (signal.aborted)
    return Promise.resolve()

  return new Promise(resolve => {
    const wait = {timer: undefined}

    const onAbort = () => {
      clearTimeout(wait.timer)
      resolve()
    }

    wait.timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal.addEventListener('abort', onAbort, {once: true})
  })
}
