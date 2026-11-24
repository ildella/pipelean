import {
  assertSyncCallback, isSyncCallbackError, isThenable, observeThenable,
  withTotal,
} from './shared.js'
import {failOnItem} from './strategy.js'

const itemErrorContext = (state, {item, error, index}) => {
  if (state.strategyName === 'throw' || isSyncCallbackError(error))
    throw error

  return {item, error, index}
}

/**
 * Report one item error through `onError`, without consulting the strategy.
 *
 * Recovery needs this: with `recover` present the error is handled, so
 * `rethrow` must not suppress the telemetry. The sync twin guards the callback
 * result (`label`) so an async `onError` is a fatal `TypeError`;
 * `notifyItemErrorAsync` awaits it.
 */
const notifyItemError = (errorContext, {onError, total}, label) => {
  if (onError)
    assertSyncCallback(
      label, 'onError', onError(withTotal(errorContext, total)),
    )
}

const notifyItemErrorAsync = async (errorContext, {onError, total}) => {
  if (onError)
    await onError(withTotal(errorContext, total))
}

/** `recover` gets the accumulator from *before* the failed item. */
const recoverContext = ({total}, {item, error, index}, state) =>
  withTotal({
    error, item, index, state,
  }, total)

const tryRecover = (plan, errorContext, state) => {
  notifyItemError(errorContext, plan, state.label)

  try {
    const next = plan.recover(recoverContext(plan, errorContext, state))
    if (isThenable(next)) {
      observeThenable(next)
      throw new TypeError('recover must be synchronous in sync folds')
    }

    return {ok: true, acc: next}
  } catch (error) {
    return {ok: false, error: {...errorContext, error}}
  }
}

const tryRecoverAsync = async (plan, errorContext, state) => {
  await notifyItemErrorAsync(errorContext, plan)

  try {
    const acc = await plan.recover(recoverContext(plan, errorContext, state))

    return {ok: true, acc}
  } catch (error) {
    return {ok: false, error: {...errorContext, error}}
  }
}

/**
 * Turn an item error into a step outcome, notifying `onError` first.
 *
 * The sync twin guards the callback result so an async `onError` is a fatal
 * `TypeError`; `handleItemErrorAsync` awaits it so an async `onError` settles
 * before the run continues.
 */
export const handleItemError = (state, errorContext, {onError, total}) => {
  const context = itemErrorContext(state, errorContext)

  notifyItemError(context, {onError, total}, state.label)

  return failOnItem(state, context)
}

export const handleItemErrorAsync = async (
  state, errorContext, {onError, total},
) => {
  const context = itemErrorContext(state, errorContext)

  await notifyItemErrorAsync(context, {onError, total})

  return failOnItem(state, context)
}

export const settleFoldError = (plan, errorContext, state) => {
  if (isSyncCallbackError(errorContext.error))
    throw errorContext.error

  if (!plan.recover) {
    return {
      recovered: false,
      errorOutcome: handleItemError(plan.state, errorContext, plan),
    }
  }

  const outcome = tryRecover(plan, errorContext, state)
  if (outcome.ok)
    return {recovered: true, acc: outcome.acc}

  return {
    recovered: false,
    errorOutcome: handleItemError(plan.state, outcome.error, plan),
  }
}

export const settleFoldErrorAsync = async (plan, errorContext, state) => {
  if (isSyncCallbackError(errorContext.error))
    throw errorContext.error

  if (!plan.recover) {
    return {
      recovered: false,
      errorOutcome: await handleItemErrorAsync(
        plan.state, errorContext, plan,
      ),
    }
  }

  const outcome = await tryRecoverAsync(plan, errorContext, state)
  if (outcome.ok)
    return {recovered: true, acc: outcome.acc}

  return {
    recovered: false,
    errorOutcome: await handleItemErrorAsync(plan.state, outcome.error, plan),
  }
}
