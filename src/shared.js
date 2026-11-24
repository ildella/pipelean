import {assertStrategy} from './strategy-name.js'

const getKnownTotal = (items, total) =>
  total !== undefined ? total : items.length

export const getPlannedTotal = ({items, take, total}) => {
  const knownTotal = getKnownTotal(items, total)

  if (knownTotal === undefined)
    return undefined

  if (take === undefined)
    return knownTotal

  return Math.min(take, knownTotal)
}

export const withTotal = (payload, total) =>
  total === undefined ? payload : {...payload, total}

export const isThenable = value =>
  value !== null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof value.then === 'function'

const SYNC_CALLBACK = Symbol('syncCallback')

const ignoreRejection = () => undefined

export const observeThenable = value => {
  try {
    const settled = value.then(undefined, ignoreRejection)

    if (isThenable(settled))
      settled.then(undefined, ignoreRejection)
  } catch {
    return undefined
  }
}

export const assertSyncResult = (value, subject, twin) => {
  if (!isThenable(value))
    return

  observeThenable(value)

  const error = new TypeError(
    `${subject} returned a Promise; use ${twin}()`,
  )
  error[SYNC_CALLBACK] = true
  throw error
}

export const isSyncCallbackError = error =>
  Boolean(error) && error[SYNC_CALLBACK] === true

const ASYNC_TWINS = {findSync: 'filter'}

const asyncTwinOf = label => ASYNC_TWINS[label] ?? label.replace(/Sync$/, '')

export const assertSyncCallback = (label, name, result) => {
  if (label === undefined)
    return result

  assertSyncResult(result, `${label}() ${name}`, asyncTwinOf(label))
  return result
}

export const assertRethrowStrategy = (strategy, label) => {
  if (strategy === undefined)
    return

  const name = assertStrategy(strategy, label)
  if (name !== 'throw')
    throw new TypeError(
      `${label}() always rethrows on the first error; ` +
      `remove the "${name}" strategy`,
    )
}

const DEAD_ERROR_CALLBACKS = ['onError', 'onFailure', 'onSourceError']

export const assertNoErrorCallbacks = (opts, label) => {
  const dead = DEAD_ERROR_CALLBACKS.find(key => opts[key] !== undefined)

  if (dead === undefined)
    return

  throw new TypeError(
    `${label}() rethrows on the first error; ` +
    `${dead} never fires — remove it or use series/seriesSync with a strategy`,
  )
}

export const parseCallArgs = args => {
  const immediate = typeof args[0] !== 'function'
  const [items, fn, opts = {}] = immediate
    ? args
    : [null, args[0], args[1]]

  return {
    immediate, items, fn, opts,
  }
}

export const isExtensibleObject = value =>
  value !== null &&
  typeof value === 'object' &&
  Object.isExtensible(value)

export const assertRecover = (recover, label) => {
  if (recover !== undefined && typeof recover !== 'function')
    throw new TypeError(`${label}() recover must be a function`)
}
