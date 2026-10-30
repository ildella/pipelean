/* eslint-disable max-lines */

import {getPlannedTotal, parseCallArgs} from './shared.js'
import {parseSearchArgs} from './search.js'
import {prepareEnrich} from './enrich.js'
import {
  collect, createRunState, failOnSource, settle, toResult,
} from './strategy.js'
import {
  handleItemError, settleFoldError,
} from './errors.js'
import {
  notifyProgress, planFold, planSeries, validateOptions,
} from './run.js'

const runSyncStrategy = ({
  state, items, take, step,
}) => {
  let index = 0

  const iterate = () => {
    for (const item of items) {
      if (take !== undefined && index >= take)
        break

      const outcome = step(item, index)
      if (outcome?.stop)
        return outcome.result
      if (outcome?.skip) {
        index++
        continue
      }

      index++
    }

    return null
  }

  try {
    const stop = iterate()
    if (stop)
      return stop
  } catch (error) {
    const handled = failOnSource(state, {error, index})
    if (handled)
      return handled
  }

  return toResult(state, settle(state))
}

export const tryCatchSync = (fn, {
  onStart, onSuccess, onError, onFinally,
} = {}) =>
  (...args) => {
    try {
      if (onStart)
        onStart()
      const result = fn(...args)
      if (onSuccess)
        onSuccess(result)
      return result
    } catch (error) {
      if (onError)
        onError(error)
      // undefined is the library-wide drop signal (see tryCatch).
      return undefined
    } finally {
      if (onFinally)
        onFinally()
    }
  }

export const seriesSync = (...args) => {
  const {
    immediate, items, fn, opts,
  } = parseCallArgs(args)

  const run = inputItems => {
    const plan = planSeries(opts, inputItems, {sync: true})

    const runFn = (item, index) => {
      const result = fn(item, index)
      notifyProgress(plan, {item, result, index})
      return result
    }

    const step = (item, index) => {
      try {
        const result = runFn(item, index)
        if (result !== undefined)
          plan.state.results.push(result)
      } catch (error) {
        return handleItemError(
          plan.state, {item, error, index}, plan,
        )
      }

      return null
    }

    return runSyncStrategy({
      state: plan.state, items: inputItems, take: plan.take, step,
    })
  }

  return immediate ? run(items) : run
}

export const filterSync = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args)

  const transform = (item, index) => {
    const keep = predicate(item, index)
    return keep ? item : undefined
  }

  const run = inputItems => seriesSync(inputItems, transform, opts)
  return immediate ? run(items) : run
}

export const findSync = (...args) => {
  const {
    immediate, items, predicate, opts,
  } = parseSearchArgs(args, {})

  const run = inputItems => {
    validateOptions(opts, {sync: true})

    const {
      strategy = collect, take, total,
      onError, onFailure, onSourceError,
    } = opts
    const plannedTotal = getPlannedTotal({items: inputItems, take, total})

    let found
    const shape = ({
      errors, sourceErrors, failure,
    }) => ({
      result: found, errors, sourceErrors, failure,
    })
    const state = createRunState(strategy, {onFailure, onSourceError, shape})

    const step = (item, index) => {
      try {
        if (predicate(item, index)) {
          found = item
          return {stop: true, result: toResult(state, settle(state))}
        }
      } catch (error) {
        return handleItemError(
          state, {item, error, index}, {onError, total: plannedTotal},
        )
      }

      return null
    }

    return runSyncStrategy({
      state, items: inputItems, take, step,
    })
  }

  return immediate ? run(items) : run
}

const runScanSync = ({
  iterable, scanner, initialValue, opts = {}, keepPartials,
}) => {
  let acc = initialValue
  const plan = planFold(opts, {
    items: iterable,
    keepPartials,
    readAcc: () => acc,
  }, {sync: true})

  const commit = value => {
    acc = value
    if (keepPartials)
      plan.state.results.push(value)
  }

  const step = (item, index) => {
    const state = acc

    try {
      commit(scanner(acc, item, index))
    } catch (error) {
      const settled = settleFoldError(plan, {item, error, index}, state)
      if (!settled.recovered)
        return settled.errorOutcome

      commit(settled.acc)
    }

    return null
  }

  return runSyncStrategy({state: plan.state, items: iterable, step})
}

// eslint-disable-next-line max-params
export const scanSync = (iterable, scanner, initialValue, opts = {}) =>
  runScanSync({
    iterable, scanner, initialValue, opts, keepPartials: true,
  })

// eslint-disable-next-line max-params
export const reduceSync = (iterable, scanner, initialValue, opts = {}) =>
  runScanSync({
    iterable, scanner, initialValue, opts, keepPartials: false,
  })

/**
 * Synchronous twin of `enrich`: fold one input through ordered steps, merging
 * each returned patch into the accumulated state.
 *
 * @param {Array<(state) => object>} operations
 * @param {{strategy?: StrategyFn, onError?, onFailure?}} opts
 * @returns {(initialState) => {value, errors, failure}}
 */
export const enrichSync = (operations, opts = {}) => {
  const {
    scanner, reduceOpts, assertInitial, finish,
  } = prepareEnrich({
    operations,
    opts,
    label: 'enrichSync',
    scannerFor: merge => (state, operation, index) =>
      merge({
        state, operation, index, patch: operation(state),
      }),
  })

  return initialState => {
    assertInitial(initialState)

    return finish(reduceSync(
      operations, scanner, initialState, reduceOpts,
    ))
  }
}

export const pipeSync = (...fns) => input =>
  fns.reduce((acc, fn) =>
    acc === undefined ? undefined : fn(acc), input)
