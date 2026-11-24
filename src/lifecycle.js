import {isExtensibleObject} from './shared.js'

// Outcome bookkeeping for the single-operation boundary (tryCatch /
// tryCatchSync). It keeps the operation's outcome separate from lifecycle-hook
// failures, so an observer can never silently relabel or mask the operation:
//
// - The operation (or policy) error is PRIMARY. Lifecycle errors never replace
//   it; they are preserved as secondaries and attached to it when it is thrown.
// - On the success path there is no operation error, so the first hook failure
//   becomes the propagated error and later hook failures are secondary to it.
// - Secondaries are never lost: they are safe-attached to the primary error, or
//   reported when the primary cannot carry them (or when recovery consumed the
//   primary and no later hook failed).

// Safe-attach secondary hook errors onto the primary error as `hookErrors`.
// Returns true when attached, false when the primary cannot carry them (a
// primitive, a frozen/non-extensible object, or one that rejects the write via
// a non-writable property, setter-less accessor or throwing Proxy trap). The
// probe and the assignment are both guarded, so a hostile primary never throws
// here. Attaching MUTATES the primary; a reused error keeps only the latest
// `hookErrors` (same caveat as assertOk's `.failure`).
const attachHookErrors = (primary, secondaries) => {
  try {
    if (!isExtensibleObject(primary))
      return false

    const existing = Array.isArray(primary.hookErrors) ? primary.hookErrors : []
    primary.hookErrors = [...existing, ...secondaries]
    return true
  } catch {
    return false
  }
}

// Last-resort reporting for secondary hook errors that cannot be attached to a
// primary error, or that survive a successful recovery. They are surfaced, not
// swallowed; the app's real reporting still belongs in onError.
const reportHookErrors = secondaries => {
  for (const error of secondaries)
    console.error('pipelean tryCatch: lifecycle hook failed', error)
}

export const createHookOutcome = () => {
  const state = {primary: null, secondaries: []}

  return {
    // The operation error (or a throwing recover): always primary.
    fail (error) {
      state.primary = error
    },
    // A lifecycle-hook failure: secondary when a primary exists, else primary.
    capture (error) {
      if (state.primary)
        state.secondaries.push(error)
      else
        state.primary = error
    },
    // A successful recover consumed the primary error.
    clear () {
      state.primary = null
    },
    primaryError () {
      return state.primary
    },
    // Throw the primary with secondaries attached (or reported), or report
    // orphan secondaries and let the caller return the value.
    settle () {
      const {primary, secondaries} = state
      if (primary) {
        if (secondaries.length > 0 && !attachHookErrors(primary, secondaries))
          reportHookErrors(secondaries)
        throw primary
      }

      if (secondaries.length > 0)
        reportHookErrors(secondaries)
    },
  }
}
