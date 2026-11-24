// Outcome bookkeeping for the single-operation boundary (tryCatch /
// tryCatchSync). Two rules, and no reporting sink:
//
// 1. The operation outcome is primary. A failure (or a throwing recover) is
//    always thrown as itself, so identity, message, stack and instanceof
//    survive.
// 2. A hook that throws while there is no primary error (the success path, or
//    after a successful recover consumed it) becomes the primary error and is
//    thrown as itself.
//
// A hook error that arrives while an operation error is already primary is
// attached to it as `hookErrors`, best effort. If the primary cannot carry the
// property (a primitive, a frozen/non-extensible object, or one that rejects
// the write), the hook error is dropped by contract: the primary is thrown
// unchanged, nothing is written to the console — see the tryCatch reference.
//
// Attaching mutates the primary; a reused error keeps only the latest
// `hookErrors` (same caveat as assertOk's `.failure`).

const attachHookErrors = (primary, errors) => {
  try {
    const existing = Array.isArray(primary.hookErrors) ? primary.hookErrors : []
    primary.hookErrors = [...existing, ...errors]
  } catch {
    // Primary cannot carry hookErrors: dropped by contract, no console.
  }
}

export const createHookOutcome = () => {
  let primary
  let hasPrimary = false
  const hookErrors = []

  const setPrimary = error => {
    primary = error
    hasPrimary = true
  }

  return {
    // The operation error (or a throwing recover): always primary.
    fail: setPrimary,
    // A lifecycle-hook failure: secondary when a primary exists, else primary.
    capture (error) {
      if (hasPrimary)
        hookErrors.push(error)
      else
        setPrimary(error)
    },
    // A successful recover consumed the primary error.
    clear () {
      primary = undefined
      hasPrimary = false
    },
    primaryError () {
      return primary
    },
    // Throw the primary with hook errors attached best-effort, or the first
    // orphan hook error when recovery consumed the primary. Falsy thrown
    // values are preserved: presence is `hasPrimary`, never truthiness.
    settle () {
      if (hasPrimary) {
        if (hookErrors.length > 0)
          attachHookErrors(primary, hookErrors)
        throw primary
      }

      if (hookErrors.length === 0)
        return

      const [first, ...rest] = hookErrors
      if (rest.length > 0)
        attachHookErrors(first, rest)
      throw first
    },
  }
}
