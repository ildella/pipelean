/**
 * Read a static key off an ESTree Property node.
 *
 * Returns the key name for a non-computed Identifier or Literal key, and null
 * for anything that cannot be resolved without scope analysis (computed keys)
 * or that is not a property at all (a spread, a method shorthand boundary).
 * Shared by the rules that inspect an inline options object.
 */
const propertyName = property => {
  if (property.type !== 'Property' || property.computed)
    return null

  const {key} = property
  return key.type === 'Identifier' ? key.name : key.value
}

export default propertyName
