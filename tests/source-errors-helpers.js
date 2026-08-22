/* eslint-disable no-unsafe-finally */
export const fragileSource = (values, error) => (async function * () {
  for (const value of values)
    yield value
  throw error
})()

export const trackedSource = values => {
  const state = {cleanedUp: false, yielded: []}
  const gen = async function * () {
    try {
      for (const value of values) {
        state.yielded.push(value)
        yield value
      }
    } finally {
      state.cleanedUp = true
    }
  }
  return {gen, state}
}

export const badCleanupSource = (values, sourceError, cleanupError) =>
  (async function * () {
    try {
      for (const value of values)
        yield value
      throw sourceError
    } finally {
      throw cleanupError
    }
  })()
