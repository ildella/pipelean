import {test, expect} from 'vitest'
import {tryCatch} from '$src/functional'
import {tryCatchSync} from '$src/index'

// A falsy thrown value is still a failure: presence is tracked explicitly,
// never by truthiness. This covers fn, every hook and recover, both twins.
const FALSY = [undefined, null, 0, '', false, NaN]

const settleAsync = async promise => {
  try {
    return {threw: false, value: await promise}
  } catch (error) {
    return {threw: true, error}
  }
}

const settleSync = fn => {
  try {
    return {threw: false, value: fn()}
  } catch (error) {
    return {threw: true, error}
  }
}

for (const value of FALSY) {
  test(`tryCatch: falsy rejection (${String(value)})`, async () => {
    const {threw, error} = await settleAsync(
      tryCatch(() => Promise.reject(value))(),
    )
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatch: falsy onSuccess throw (${String(value)})`, async () => {
    const {threw, error} = await settleAsync(tryCatch(() => 'data', {
      onSuccess: () => {
        throw value
      },
    })())
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatch: falsy onFinally throw (${String(value)})`, async () => {
    const {threw, error} = await settleAsync(tryCatch(() => 'data', {
      onFinally: () => {
        throw value
      },
    })())
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatch: falsy recover throw (${String(value)})`, async () => {
    const {threw, error} = await settleAsync(tryCatch(
      () => Promise.reject(new Error('op')),
      {
        recover: () => {
          throw value
        },
      },
    )())
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatch: falsy onError throw (${String(value)})`, async () => {
    const opError = new Error('op')
    const {threw, error} = await settleAsync(tryCatch(
      () => Promise.reject(opError),
      {
        onError: () => {
          throw value
        },
      },
    )())
    expect(threw).toBe(true)
    expect(error).toBe(opError)
    expect(error.hookErrors).toHaveLength(1)
    expect(Object.is(error.hookErrors[0], value)).toBe(true)
  })

  test(`tryCatchSync: falsy throw (${String(value)})`, () => {
    const {threw, error} = settleSync(tryCatchSync(() => {
      throw value
    }))
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatchSync: falsy onSuccess throw (${String(value)})`, () => {
    const {threw, error} = settleSync(tryCatchSync(() => 'data', {
      onSuccess: () => {
        throw value
      },
    }))
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatchSync: falsy onFinally throw (${String(value)})`, () => {
    const {threw, error} = settleSync(tryCatchSync(() => 'data', {
      onFinally: () => {
        throw value
      },
    }))
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatchSync: falsy recover throw (${String(value)})`, () => {
    const {threw, error} = settleSync(tryCatchSync(() => {
      throw new Error('op')
    }, {
      recover: () => {
        throw value
      },
    }))
    expect(threw).toBe(true)
    expect(Object.is(error, value)).toBe(true)
  })

  test(`tryCatchSync: falsy onError throw (${String(value)})`, () => {
    const opError = new Error('op')
    const {threw, error} = settleSync(tryCatchSync(() => {
      throw opError
    }, {
      onError: () => {
        throw value
      },
    }))
    expect(threw).toBe(true)
    expect(error).toBe(opError)
    expect(error.hookErrors).toHaveLength(1)
    expect(Object.is(error.hookErrors[0], value)).toBe(true)
  })
}
