export const seriesShape = ({
  results, errors, sourceErrors, failure,
}) =>
  ({
    results, errors, sourceErrors, failure,
  })

export const handleSourceError = ({
  error, index, strategyName, onSourceError, onFailure,
  results, errors, sourceErrors, shape,
}) => {
  if (strategyName === 'throw')
    throw error

  const sourceContext = {error, index}

  if (onSourceError)
    onSourceError(sourceContext)

  if (strategyName === 'failFast') {
    onFailure?.(sourceContext)
    return shape({
      results: [],
      errors,
      sourceErrors: [sourceContext],
      failure: sourceContext,
    })
  }

  if (strategyName === 'skip')
    return shape({
      results, errors, sourceErrors: [], failure: false,
    })

  sourceErrors.push(sourceContext)
  return null
}

export const aggregateFailure = ({
  strategyName, onFailure, errors, sourceErrors,
}) => {
  const failure = strategyName === 'failLate' &&
    (errors.length > 0 || sourceErrors.length > 0)
    ? {errors: [...errors, ...sourceErrors]}
    : false

  if (failure && onFailure)
    onFailure(failure)

  return failure
}

export const handleItemError = (errorContext, {
  strategyName, onFailure, errors, sourceErrors, shape,
}) => {
  if (strategyName === 'throw')
    throw errorContext.error

  if (strategyName === 'failFast') {
    onFailure?.(errorContext)
    return {
      stop: true,
      result: shape({
        results: [], errors, sourceErrors, failure: errorContext,
      }),
    }
  }

  if (strategyName === 'skip')
    return {skip: true}

  errors.push(errorContext)
  return null
}

export const normalizeOperationError = ({
  item: operation, error, index, total,
}) => {
  const base = {
    operation: operation.name || `operation-${index}`,
    error,
    index,
  }
  return total !== undefined ? {...base, total} : base
}

export const normalizeFailure = failure => {
  if (failure === false)
    return false
  if (failure.errors)
    return {errors: failure.errors.map(normalizeOperationError)}
  return normalizeOperationError(failure)
}
