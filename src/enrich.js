import {
  collect, normalizeFailure, normalizeOperationError,
} from './strategy.js'

const validateOperations = (operations, label) => {
  if (!Array.isArray(operations))
    throw new TypeError(`${label}() requires an array of operations`)

  for (const op of operations) {
    if (typeof op !== 'function') {
      throw new TypeError(
        `${label}() requires every operation to be a function`,
      )
    }
  }
}

const assertEnrichState = (initialState, label) => {
  if (initialState === null ||
    typeof initialState !== 'object' ||
    Array.isArray(initialState)) {
    throw new TypeError(
      `${label}() requires initialState to be a non-null, non-array object`,
    )
  }
}

const mergePatch = ({
  state, operation, index, patch,
}) => {
  if (patch === null ||
    typeof patch !== 'object' ||
    Array.isArray(patch)) {
    const name = operation.name || `operation-${index}`
    throw new TypeError(
      `Operation ${name} must return a non-null, non-array object`,
    )
  }

  return {...state, ...patch}
}

const reduceOptions = ({strategy, onError, onFailure}) => ({
  strategy,
  ...onError
    ? {onError: ctx => onError(normalizeOperationError(ctx))}
    : {},
  ...onFailure
    ? {onFailure: ctx => onFailure(normalizeFailure(ctx))}
    : {},
})

const finishEnrich = result => ({
  value: result.value,
  errors: result.errors.map(normalizeOperationError),
  failure: normalizeFailure(result.failure),
})

/**
 * Validate an enrichment pipeline and prepare what both `enrich` and
 * `enrichSync` need: the step scanner, the reduce options and the result
 * shaping.
 *
 * `scannerFor` is the only coloured part: each twin passes its own sync/async
 * scanner builder, everything else is shared.
 *
 * @param {{
 *  operations: Array<(state) => object>,
 *  opts: {strategy?: StrategyFn, onError?, onFailure?},
 *  label: string,
 *  scannerFor: (merge: Function) => Function
 * }} params
 */
export const prepareEnrich = ({
  operations, opts, label, scannerFor,
}) => {
  validateOperations(operations, label)

  if (opts.recover !== undefined)
    throw new TypeError(
      `${label} does not support recover; use reduce if fold recovery is ` +
      'needed',
    )

  const {strategy = collect, onError, onFailure} = opts

  return {
    scanner: scannerFor(mergePatch),
    reduceOpts: reduceOptions({strategy, onError, onFailure}),
    assertInitial: initialState => assertEnrichState(initialState, label),
    finish: finishEnrich,
  }
}
