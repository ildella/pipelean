import {assertSyncResult} from './shared.js'
import {prepareEnrich} from './enrich.js'

const asyncScanner = merge => async (state, operation, index) =>
  merge({
    state, operation, index, patch: await operation(state),
  })

const syncScanner = (label, twin) => merge => (state, operation, index) => {
  const patch = operation(state)
  assertSyncResult(patch, `${label}() operation`, twin)
  return merge({
    state, operation, index, patch,
  })
}

/**
 * Build one enrich runner for either twin. `reduceFn` is injected by the
 * caller (`reduce` or `reduceSync`) so this module never imports the
 * functional modules that import it.
 */
export const makeEnricher = ({
  operations, opts = {}, label, twin, sync = false,
}, reduceFn) => {
  const {
    steps, scanner, reduceOpts, assertInitial, finish,
  } = prepareEnrich({
    operations,
    opts,
    label,
    sync,
    scannerFor: sync ? syncScanner(label, twin) : asyncScanner,
  })

  if (sync)
    return initialState => {
      assertInitial(initialState)
      return finish(reduceFn(steps, scanner, initialState, reduceOpts))
    }

  return async initialState => {
    assertInitial(initialState)
    return finish(await reduceFn(steps, scanner, initialState, reduceOpts))
  }
}
