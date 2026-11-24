/**
 * Explicit drop sentinel.
 *
 * `drop` is the spelled-out way to remove a value from iteration: a mapper
 * returning it drops the item, a `pipe` step returning it short-circuits the
 * pipeline. It is a registered symbol, so two copies of pipelean still agree on
 * its identity.
 */
export const drop = Symbol.for('pipelean.drop')

export const isDrop = value => value === drop

const UNDEFINED_POLICY = Symbol('undefinedPolicy')

/**
 * Normalize the `onUndefined` option of the series family.
 *
 * `'drop'` (the default) keeps the 0.18 behaviour: an `undefined` result drops
 * the item. `'error'` turns it into a fatal policy error. Anything else is a
 * configuration mistake and is rejected eagerly.
 */
export const normalizeOnUndefined = (value, label) => {
  if (value === undefined)
    return 'drop'

  if (value !== 'drop' && value !== 'error')
    throw new TypeError(`${label}() onUndefined must be 'drop' or 'error'`)

  return value
}

/**
 * A fatal `undefined`-policy error: it must escape the run, never be collected
 * as an item or source error.
 */
export const undefinedPolicyError = subject => {
  const error = new TypeError(
    `${subject} returned undefined; return drop to drop the value, ` +
    'or set onUndefined: \'drop\'',
  )
  error[UNDEFINED_POLICY] = true
  return error
}

export const isUndefinedPolicyError = error =>
  Boolean(error) && error[UNDEFINED_POLICY] === true
