const attachHookErrors = (primary, errors) => {
  try {
    const existing = Array.isArray(primary.hookErrors) ? primary.hookErrors : []
    primary.hookErrors = [...existing, ...errors]
  } catch {
    return undefined
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
    fail: setPrimary,
    capture (error) {
      if (hasPrimary)
        hookErrors.push(error)
      else
        setPrimary(error)
    },
    clear () {
      primary = undefined
      hasPrimary = false
    },
    primaryError () {
      return primary
    },
    settle () {
      if (hasPrimary) {
        if (hookErrors.length > 0)
          attachHookErrors(primary, hookErrors)
        throw primary
      }

      if (hookErrors.length > 0)
        throw hookErrors[0]
    },
  }
}
