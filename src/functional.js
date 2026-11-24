/* eslint-disable max-lines */

import {
  assertNoErrorCallbacks, assertRecover, assertRethrowStrategy,
  assertUnsupportedOptions, isExtensibleObject, isThenable, parseCallArgs,
} from './shared.js'
import {createHookOutcome} from './lifecycle.js'
import {parseSearchArgs} from './search.js'
import {makeEnricher} from './enrich-runner.js'
import {
  drop, isDrop, isUndefinedPolicyError, undefinedPolicyError,
} from './sentinel.js'
import {strategyNameOf} from './strategy-name.js'
import {
  collect, finishRun, normalizeOperationError, rethrow, settleSourceError,
} from './strategy.js'
import {
  handleItemErrorAsync, settleFoldErrorAsync,
} from './errors.js'
import {
  LIFECYCLE_OPTIONS, notifyProgress, planFold, planSeries,
} from './run.js'
import {waitWithSignal} from './wait.js'

/**
 * @typedef {import('./types.js').StrategyFn} StrategyFn
 * @typedef {import('./types.js').Failure} Failure
 * @typedef {import('./types.js').IterationResult} IterationResult
 * @typedef {import('./types.js').ReduceResult} ReduceResult
 * @typedef {import('./types.js').EnrichResult} EnrichResult
 * @typedef {import('./types.js').JoinResult} JoinResult
 */

export {where} from './search.js'
export {
  collect, failFast, failLate, rethrow, skip,
} from './strategy.js'

const observeHook = async (outcome, hook, context) => {
  if (!hook)
    return
  try {
    await hook(context)
  } catch (error) {
    outcome.capture(error)
  }
}

const handleFailure = async (outcome, {onError, recover}, context) => {
  const failureContext = {...context, error: outcome.primaryError()}
  await observeHook(outcome, onError, failureContext)
  if (!recover)
    return undefined

  try {
    const value = await recover(failureContext)
    outcome.clear()
    return value
  } catch (recoverError) {
    outcome.fail(recoverError)
    return undefined
  }
}

/**
 * Wrap an async function as a composable execution boundary.
 *
 * The operation's outcome is primary. By default a failure is rethrown — the
 * wrapper never swallows. `recover({error, args, name})` is the one explicit
 * seam where a failure becomes a value: it returns the substitute and consumes
 * the error; `recover: () => undefined` is the spelled-out drop that
 * short-circuits `pipe` and drops the item in `series`. Without `recover`, a
 * `tryCatch` inside `series` just observes and the run's strategy still decides
 * policy.
 *
 * Every hook and `recover` receives one context object: `args` is a copy of the
 * wrapper invocation's argument list and `name` is the optional `name` option.
 * Hooks that observe a value also get it: `onSuccess({result, args, name})`,
 * `onError({error, args, name})`, `onStart`/`onFinally` get `{args, name}`.
 * Their return values are ignored.
 *
 * Failure contract:
 *
 * - `onStart` is a boundary guard: if it throws, `fn` does not run and its
 *   error flows through `onError` + the failure policy like a `fn` failure.
 * - On the success path a throwing `onSuccess`/`onFinally` propagates as
 *   itself (a hook failure, never relabeled as the operation's failure).
 * - On the failure path the operation error is never replaced by a hook error:
 *   a throwing `onError`/`onFinally` is kept as a secondary, attached to the
 *   primary as `error.hookErrors` best-effort. If the primary cannot carry the
 *   property, the hook error is dropped — never reported or substituted.
 * - A throwing `recover` propagates its own error (the original was already
 *   observed by `onError`). `onSuccess` does not run on a recovered value.
 * - After a successful `recover` the operation counts as successful: the
 *   first hook failure is thrown as itself, including one raised on the
 *   failure path (a throwing `onError`); a later hook failure is attached
 *   to it as `error.hookErrors`.
 *
 * Sync twin: tryCatchSync.
 */
export const tryCatch = (fn, opts = {}) => {
  const {
    onStart, onSuccess, onError, onFinally, recover, name,
  } = opts
  assertRecover(recover, 'tryCatch')

  return async (...args) => {
    const outcome = createHookOutcome()
    const context = {args: [...args], name}
    let result
    let failed = false

    try {
      if (onStart)
        await onStart(context)
      result = await fn(...args)
    } catch (error) {
      failed = true
      outcome.fail(error)
    }

    if (failed)
      result = await handleFailure(outcome, {onError, recover}, context)
    else
      await observeHook(outcome, onSuccess, {...context, result})

    await observeHook(outcome, onFinally, context)
    outcome.settle()
    return result
  }
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const isRetryAttempts = attempts =>
  Number.isInteger(attempts) && attempts >= 1

const isRetryDelay = delayMs =>
  typeof delayMs === 'number' &&
  Number.isFinite(delayMs) &&
  delayMs >= 0

export const retry = (fn, {attempts = 3, delay: delayMs = 0} = {}) => {
  if (typeof fn !== 'function')
    throw new TypeError('retry() requires a function')

  if (!isRetryAttempts(attempts))
    throw new TypeError('retry() attempts must be an integer >= 1')

  if (!isRetryDelay(delayMs))
    throw new TypeError('retry() delay must be a finite number >= 0')

  return async (...args) => {
    let lastError
    for (let i = 0; i < attempts; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await fn(...args)
      } catch (error) {
        lastError = error

        const isLastAttempt = i === attempts - 1
        if (!isLastAttempt && delayMs > 0) {
          // eslint-disable-next-line no-await-in-loop
          await delay(delayMs)
        }
      }
    }
    throw lastError
  }
}

const failureCause = failure =>
  Array.isArray(failure.errors)
    ? failure.errors[0]?.error
    : failure.error

const withFailure = (error, failure) => {
  error.failure = failure
  return error
}

const attachFailure = (error, failure) => {
  try {
    if (!isExtensibleObject(error))
      return undefined

    return withFailure(error, failure)
  } catch {
    return undefined
  }
}

/**
 * Throw when a structured result carries a truthy `failure`.
 *
 * The `failFast` default can stop a run "silently" if the caller ignores the
 * returned object: the failure is data, not an exception. `assertOk` turns an
 * ignored outcome into a thrown error, preserving the original error whenever
 * it can: for a `failFast` failure that is `failure.error`, for a `failLate`
 * aggregate the FIRST error in `failure.errors`. The thrown value is the same
 * object the operation threw, so its identity, message, stack and class
 * (`instanceof`) survive. Its `failure` property is the structured failure
 * object (the `{errors}` aggregate for `failLate`).
 *
 * Attaching `failure` MUTATES the original error. An error object reused
 * across results keeps only the latest `.failure`.
 *
 * When the underlying throw value cannot carry a property, `assertOk` falls
 * back to a new `Error('pipelean: operation failed')` with `cause` set to the
 * underlying value and `failure` attached. That covers primitive throw values
 * (string, number, `undefined`, `null`), frozen or otherwise non-extensible
 * error objects, and values that REJECT the attachment: a non-writable
 * `failure` own property, a `failure` accessor without a setter, or a Proxy
 * whose `set`/`isExtensible` trap throws. In every case the original value is
 * left untouched and its identity is preserved as `cause`.
 *
 * It expects an **awaited** Pipelean result. A thenable is rejected with a
 * `TypeError` (an un-awaited `series()` call would otherwise be returned as a
 * Promise and the guard would be silently skipped), and so is a value that is
 * not a result object.
 *
 * It asserts **no failure**, not "no errors": under `collect` / `skip` the
 * `failure` field is false even when `errors` is non-empty, so the result is
 * returned unchanged. Use it to guard ignored outcomes, not to turn `collect`
 * into `rethrow`.
 *
 * @param {{failure: Failure}} result An awaited Pipelean result.
 * @returns {*} The same result object when `failure` is falsy.
 * @throws {*} The original underlying error with `.failure` attached, or the
 *   wrapped fallback described above when the underlying value cannot carry
 *   the property.
 */
export const assertOk = result => {
  if (isThenable(result))
    throw new TypeError('assertOk() expects an awaited result, not a Promise')

  if (result === null || typeof result !== 'object' || !('failure' in result))
    throw new TypeError('assertOk() expects a pipelean result')

  if (!result.failure)
    return result

  const {failure} = result
  const underlying = failureCause(failure)
  const attached = attachFailure(underlying, failure)

  if (attached)
    throw attached

  throw withFailure(
    new Error('pipelean: operation failed', {cause: underlying}),
    failure,
  )
}

export const assign = (property, parse) => state => {
  const value = parse(state)
  return value === undefined || isDrop(value) ? {} : {[property]: value}
}

const isPositiveDuration = duration =>
  typeof duration === 'number' && Number.isFinite(duration) && duration > 0

/**
 * Pause after a step, if configured and if the run was not aborted.
 *
 * `pause` may be a number or a function returning a value or a promise. A
 * non-positive/`undefined`/`NaN` duration means "no wait". A throw escapes to
 * the caller — never into the item error path.
 */
const waitForPause = async (pause, signal, args) => {
  if (pause === undefined || signal?.aborted)
    return

  const duration = typeof pause === 'function'
    ? await pause(...args)
    : pause

  if (isPositiveDuration(duration))
    await waitWithSignal(duration, signal)
}

const shouldStopPull = (signal, index, take) =>
  signal?.aborted || (take !== undefined && index >= take)

const runAsyncStrategy = async ({
  state, items, take, step, signal,
}) => {
  let index = 0

  const iterate = async () => {
    if (shouldStopPull(signal, 0, take))
      return null

    for await (const item of items) {
      if (shouldStopPull(signal, index, take))
        break

      const outcome = await step(item, index)
      if (outcome?.stop)
        return outcome.result

      index++
      if (shouldStopPull(signal, index, take))
        break
    }

    return null
  }

  try {
    const stop = await iterate()
    if (stop)
      return stop
  } catch (error) {
    if (isUndefinedPolicyError(error))
      throw error

    return settleSourceError(state, {error, index})
  }

  return finishRun(state)
}

/**
 * Apply one series mapper, recording either its result or the handled error.
 */
const attemptSeriesItem = async (plan, runFn, {item, index}) => {
  try {
    const result = await runFn(item, index)

    if (isDrop(result))
      return {failed: false}

    if (result === undefined) {
      if (plan.onUndefined === 'error')
        throw undefinedPolicyError('series() mapper')
      return {failed: false}
    }

    plan.state.results.push(result)
    return {failed: false}
  } catch (error) {
    if (isUndefinedPolicyError(error))
      throw error

    const errorOutcome = await handleItemErrorAsync(
      plan.state, {item, error, index}, plan,
    )

    return {failed: true, errorOutcome}
  }
}

const shouldPauseAfter = (plan, failed, errorOutcome) =>
  !failed || Boolean(errorOutcome?.skip) || plan.pauseOnErrors

/**
 * Sequential execution over an iterable, one item at a time.
 *
 * @returns {Promise<IterationResult>|((items) => Promise<IterationResult>)}
 */
export const series = (...args) => {
  const {
    immediate, items, fn, opts,
  } = parseCallArgs(args)

  const run = inputItems => {
    const plan = planSeries(opts, inputItems)

    const runFn = async (item, index) => {
      const result = await fn(item, index)
      await notifyProgress(plan, {item, result, index})
      return result
    }

    const step = async (item, index) => {
      const {failed, errorOutcome} = await attemptSeriesItem(
        plan, runFn, {item, index},
      )

      if (errorOutcome?.stop)
        return errorOutcome

      if (shouldPauseAfter(plan, failed, errorOutcome))
        await waitForPause(plan.pause, plan.signal, [item, index])

      return errorOutcome ?? null
    }

    return runAsyncStrategy({
      state: plan.state,
      items: inputItems,
      take: plan.take,
      step,
      signal: plan.signal,
    })
  }

  return immediate ? run(items) : run
}

/**
 * Sequential selection over an iterable.
 *
 * `onUndefined` belongs to the `series` family only: passing it here is
 * rejected instead of silently ignored.
 *
 * @returns {Promise<IterationResult>|((items) => Promise<IterationResult>)}
 */
export const filter = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args)

  assertUnsupportedOptions(opts ?? {}, ['onUndefined'], 'filter')

  const transform = async (item, index) => {
    const keep = await predicate(item, index)

    return isDrop(keep) || !keep ? drop : item
  }

  const run = inputItems => series(inputItems, transform, opts)
  return immediate ? run(items) : run
}

/**
 * One fold engine for `scan` and `reduce`.
 *
 * `keepPartials: true` returns `{ results, errors, sourceErrors, failure }`
 * with every intermediate accumulator; `false` returns
 * `{ value, errors, sourceErrors, failure }` with the last one.
 *
 * @param {{
 *  iterable: AsyncIterable|Array,
 *  scanner: (accumulator, item, index) => Promise<Accumulator>,
 *  initialValue: *,
 *  opts?: {strategy?: StrategyFn, onError?, onFailure?, onSourceError?,
 *    recover?: (context) => any, pause?, pauseOnErrors?, signal?},
 *  keepPartials: boolean
 * }} params
 */
const runScan = ({
  iterable, scanner, initialValue, opts = {}, keepPartials,
}) => {
  let acc = initialValue
  const plan = planFold(opts, {
    items: iterable,
    keepPartials,
    readAcc: () => acc,
  })

  const commit = value => {
    acc = value
    if (keepPartials)
      plan.state.results.push(value)
  }

  const step = async (item, index) => {
    const state = acc
    let failed = false
    let errorOutcome

    try {
      commit(await scanner(acc, item, index))
    } catch (error) {
      const settled = await settleFoldErrorAsync(
        plan, {item, error, index}, state,
      )
      if (settled.recovered)
        commit(settled.acc)
      else {
        failed = true
        errorOutcome = settled.errorOutcome
        if (errorOutcome?.stop)
          return errorOutcome
      }
    }

    if (!failed || plan.pauseOnErrors)
      await waitForPause(plan.pause, plan.signal, [acc, item, index])

    return errorOutcome ?? null
  }

  return runAsyncStrategy({
    state: plan.state, items: iterable, step, signal: plan.signal,
  })
}

/**
 * Fold over data items and keep every intermediate accumulator.
 *
 * Use when each item depends on the previous one AND every intermediate value
 * is itself useful. Default strategy is `failFast` (a half-done fold is
 * usually meaningless); note that `failFast` clears `results` on failure.
 *
 * @param {AsyncIterable|Array} iterable - Source of values.
 * @param {(accumulator, item, index) => Promise<Accumulator>} scanner
 * @param {*} initialValue
 * @param {{strategy?: StrategyFn, onError?, onFailure?, onSourceError?,
 *   recover?: (context) => any}} opts
 * @returns {Promise<IterationResult>}
 */
// eslint-disable-next-line max-params
export const scan = (iterable, scanner, initialValue, opts = {}) =>
  runScan({
    iterable, scanner, initialValue, opts, keepPartials: true,
  })

/**
 * Fold over data items and keep only the final accumulator.
 *
 * Use when the last value is all you need: sums, counts, growing records, or a
 * service loop built with `forever()` + `signal` + `pause` (and `recover` when
 * a failed round must not end the loop).
 *
 * @param {AsyncIterable|Array} iterable - Source of values.
 * @param {(accumulator, item, index) => Promise<Accumulator>} scanner
 * @param {*} initialValue
 * @param {{strategy?: StrategyFn, onError?, onFailure?, onSourceError?,
 *   recover?: (context) => any}} opts
 * @returns {Promise<ReduceResult>}
 */
// eslint-disable-next-line max-params
export const reduce = (iterable, scanner, initialValue, opts = {}) =>
  runScan({
    iterable, scanner, initialValue, opts, keepPartials: false,
  })

/**
 * Enrich one input through an ordered list of steps.
 *
 * `enrich` is literally `reduce` over your steps:
 * `enrich(ops)(input) === reduce(ops, (s, op) => ({...s, ...op(s)}), input)`.
 * In FP terms it is a fold over endomorphisms `State -> Patch` with a
 * shallow `merge` combiner.
 *
 * Each operation receives the current state and returns an object patch that is
 * shallow-merged in. The pipeline is built once and reused with different
 * inputs; errors are reported per operation, named after the function.
 *
 * Two optional hooks expose the fold step by step, for progress UIs:
 *
 * - `onStepStart({operation, index, total})` runs before `operation(state)`.
 * - `onStepSuccess({operation, patch, index, total})` runs only after the patch
 *   has been validated and merged; `patch` is what the operation returned,
 *   before the merge.
 *
 * `operation` is `fn.name` or `operation-${index}`, the same normalization used
 * by `onError`. Errors stay on `onError`; there is no `onStepError`. This
 * function awaits both hooks (the sync twin does not), and a hook that throws
 * is treated as a failed step: it flows into the strategy like a throwing
 * operation, so `failFast` stops later hooks and a throwing `onStepSuccess`
 * leaves its patch uncommitted.
 *
 * Only `strategy`, `onError`, `onFailure` and the two step hooks apply: the run
 * lifecycle (`signal`, `pause`, `take`, `onProgress`, …) and `recover` are
 * rejected with a `TypeError` when the pipeline is built, because a step fold
 * has no source to pull or stop.
 *
 * @param {Array<(state) => object>} operations
 * @param {{strategy?: StrategyFn, onError?, onFailure?, onStepStart?,
 *   onStepSuccess?}} opts
 * @returns {(initialState) => Promise<EnrichResult>}
 */
export const enrich = (operations, opts = {}) =>
  makeEnricher({operations, opts, label: 'enrich'}, reduce)

const runBranch = (fn, key, index) =>
  Promise.resolve().then(() => fn(key, index))

/**
 * Fork/join over a record of named async tasks.
 *
 * Every task starts immediately and `join` waits for all of them to settle —
 * there is no cancellation, no scheduler, and completion order never affects
 * the shape of the result. Errors are data, per branch, using the same error
 * strategies as `enrich`:
 *
 * - `collect` (default) keeps the successful branches in `value` and the
 *   failed ones in `errors` as `{operation, error, index}`; `failure` is false.
 * - `failLate` behaves like `collect` but sets `failure: {errors}`.
 * - `failFast` is an alias of `failLate`: branches already started and cannot
 *   be stopped without an AbortSignal.
 * - `skip` keeps `errors` empty while still calling `onError`.
 * - `rethrow` throws the original error of the first failed branch, by
 *   declaration order, once every branch has settled.
 *
 * A branch resolving `undefined` is a success with value `undefined`: the
 * "undefined drops the item" convention belongs to iteration, not to a fork.
 *
 * Rejects with a `TypeError` for a non-record input — including a thenable
 * such as an un-awaited `Promise` — before any branch starts.
 *
 * Only `strategy`, `onError` and `onFailure` apply: a branch is not an item, so
 * the run lifecycle (`signal`, `pause`, `take`, `onProgress`, …) and `recover`
 * are rejected with a `TypeError` before any branch starts, never ignored.
 *
 * @param {Record<string, (key: string, index: number) => any>} tasks
 * @param {{strategy?: StrategyFn, onError?, onFailure?}} opts
 * @returns {Promise<JoinResult>}
 */
// eslint-disable-next-line complexity, max-statements
export const join = async (tasks, opts = {}) => {
  if (opts.recover !== undefined)
    throw new TypeError('join() does not support recover')

  assertUnsupportedOptions(opts, LIFECYCLE_OPTIONS, 'join')

  if (tasks === null || typeof tasks !== 'object' || Array.isArray(tasks))
    throw new TypeError('join() requires a record of named async functions')

  const entries = Object.entries(tasks)
  if (entries.length === 0 && typeof tasks.then === 'function')
    throw new TypeError(
      'join() received a thenable, not a record of tasks ' +
      '(did you forget to await it?)',
    )

  for (const [key, fn] of entries) {
    if (typeof fn !== 'function')
      throw new TypeError(`join() requires task "${key}" to be a function`)
  }

  const {strategy = collect, onError, onFailure} = opts
  const strategyName = strategyNameOf(strategy, 'join')
  const isFailLate = strategyName === 'failLate' || strategyName === 'failFast'

  const value = {}
  const errors = []
  const finishJoin = failure => ({
    value,
    errors,
    sourceErrors: [],
    failure,
  })

  const settled = await Promise.allSettled(
    entries.map(([key, fn], index) => runBranch(fn, key, index)),
  )

  for (let index = 0; index < settled.length; index++) {
    const key = entries[index][0]
    const outcome = settled[index]

    if (outcome.status === 'fulfilled') {
      value[key] = outcome.value
      continue
    }

    if (strategyName === 'throw')
      continue

    const context = {operation: key, error: outcome.reason, index}

    if (onError) {
      // eslint-disable-next-line no-await-in-loop
      await onError(context)
    }

    if (strategyName !== 'skip')
      errors.push(context)
  }

  if (strategyName === 'throw') {
    const firstFailed = settled.find(outcome => outcome.status === 'rejected')
    if (firstFailed)
      throw firstFailed.reason
    return finishJoin(false)
  }

  const failure = isFailLate && errors.length > 0 ? {errors} : false

  if (failure && onFailure)
    await onFailure(failure)

  return finishJoin(failure)
}

export {normalizeOperationError}

export const pipe = (...fns) => input =>
  fns.reduce(async (acc, fn) => {
    const value = await acc

    return value === undefined || isDrop(value) ? value : fn(value)
  }, input)

/**
 * Sequential map that rethrows the first error and returns a bare array.
 *
 * `mapSeries` is `series` with the strategy locked to `rethrow` and the report
 * unwrapped: the promise resolves to `.results` or rejects with the ORIGINAL
 * error. It accepts both call forms, like `series`:
 *
 * - `mapSeries(items, fn, opts?)` runs immediately.
 * - `mapSeries(fn, opts?)` returns `items => Promise<Array>`.
 *
 * Every other option passes through untouched (`signal`, `pause`, `take`,
 * `total`, `onProgress`, …). A `strategy` other than `rethrow` / `'throw'` is a
 * configuration mistake and is rejected with a `TypeError`.
 *
 * Two inherited behaviors matter:
 *
 * - A mapper returning `undefined` DROPS the item, so the result can be shorter
 *   than the input. This is not `Array.prototype.map`.
 * - Under `rethrow` a failed item throws before any callback, so `onError`
 *   and `onFailure` can never fire: passing either (or `onSourceError`) is
 *   rejected with a `TypeError` instead of being silently ignored.
 *
 * @param {AsyncIterable|Array} items - Source of values.
 * @param {(item, index) => any} fn - Sequential mapper.
 * @param {{strategy?: 'throw'|StrategyFn, onProgress?, take?, total?,
 *   pause?, signal?}} opts
 * @returns {Promise<Array>|((items) => Promise<Array>)}
 */
export const mapSeries = (...args) => {
  const {
    immediate, items, fn, opts,
  } = parseCallArgs(args)
  assertRethrowStrategy(opts.strategy, 'mapSeries')
  assertNoErrorCallbacks(opts, 'mapSeries')

  const run = async inputItems =>
    (await series(inputItems, fn, {...opts, strategy: rethrow})).results

  return immediate ? run(items) : run
}
