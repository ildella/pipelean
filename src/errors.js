import {withTotal} from './shared.js'
import {failOnItem} from './strategy.js'

// Item-error handling: report the error, then consult the strategy. Fold
// `recover` is the one seam between the two — it turns an error into the next
// accumulator and, when it succeeds, consumes the error entirely.

const itemErrorContext = (state, {item, error, index}) => {
  if (state.strategyName === 'throw')
    throw error

  return {item, error, index}
}

/**
 * Report one item error through `onError`, without consulting the strategy.
 *
 * Recovery needs this: with `recover` present the error is handled, so
 * `rethrow` must not suppress the telemetry. The sync twin leaves the callback
 * fire-and-forget; `notifyItemErrorAsync` awaits it.
 */
const notifyItemError = (errorContext, {onError, total}) => {
  if (onError)
    onError(withTotal(errorContext, total))
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

const isThenable = value =>
  value !== null && typeof value?.then === 'function'

const tryRecover = (plan, errorContext, state) => {
  notifyItemError(errorContext, plan)

  try {
    const next = plan.recover(recoverContext(plan, errorContext, state))
    if (isThenable(next))
      throw new TypeError('recover must be synchronous in sync folds')

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
 * The sync twin leaves the callback fire-and-forget; `handleItemErrorAsync`
 * awaits it so an async `onError` settles before the run continues.
 */
export const handleItemError = (state, errorContext, {onError, total}) => {
  const context = itemErrorContext(state, errorContext)

  notifyItemError(context, {onError, total})

  return failOnItem(state, context)
}

export const handleItemErrorAsync = async (
  state, errorContext, {onError, total},
) => {
  const context = itemErrorContext(state, errorContext)

  await notifyItemErrorAsync(context, {onError, total})

  return failOnItem(state, context)
}

// A recovered error is consumed (a successful iteration); anything else is the
// usual item error path, including a `recover` that throws.
export const settleFoldError = (plan, errorContext, state) => {
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
