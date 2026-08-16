export async function * fragileGenerator () {
  yield {id: 1, data: 'a'}
  yield {id: 2, data: 'b'}
  throw new Error('DB connection lost at index 2')
  // yield {id: 3, data: 'c'} // never reached
}

export async function * fragileGeneratorLate () {
  yield {id: 1, data: 'a'}
  yield {id: 2, data: 'b'}
  yield {id: 3, data: 'c'}
  throw new Error('DB connection lost at index 3')
}

// eslint-disable-next-line require-yield
export async function * fragileGeneratorImmediate () {
  throw new Error('DB connection lost before first yield')
}

export function * fragileGeneratorSync () {
  yield {id: 1, data: 'a'}
  throw new Error('Sync source error at index 1')
  // yield {id: 2, data: 'b'}
}

// Track whether cleanup (finally) ran
export const createTrackedGenerator = () => {
  let cleanedUp = false
  async function * gen () {
    try {
      yield {id: 1}
      yield {id: 2}
      throw new Error('source error')
      // yield {id: 3}
    } finally {
      cleanedUp = true
    }
  }
  return {
    gen,
    get cleanedUp () {
      return cleanedUp
    },
  }
}
