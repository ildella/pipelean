/**
 * Import resolution for no-fold-rethrow suggestions. The policy (reuse an
 * existing plain or aliased binding, append to the named import that binds
 * reduceSync, withhold when a default/namespace import occupies the name,
 * skip namespace/default-only imports) is documented in the rule header.
 */
const FOLD_SYNC = 'foldSync'
const REDUCE_SYNC = 'reduceSync'
const PIPLEAN_SOURCE = 'pipelean'

const isPipeleanImport = ({type, source}) =>
  type === 'ImportDeclaration' && source.value === PIPLEAN_SOURCE

const isNamedSpecifier = ({type}) => type === 'ImportSpecifier'
const namedSpecifiers = declaration =>
  declaration.specifiers.filter(isNamedSpecifier)
const isFoldSyncSpecifier = ({imported}) => imported.name === FOLD_SYNC
const isReduceSyncSpecifier = ({imported}) => imported.name === REDUCE_SYNC

const pipeleanImports = sourceCode =>
  sourceCode.ast.body.filter(isPipeleanImport)

const findFoldSyncSpecifier = declarations => {
  for (const declaration of declarations) {
    const found = namedSpecifiers(declaration).find(isFoldSyncSpecifier)
    if (found)
      return found
  }

  return null
}

const isOccupiedFoldSync = ({type, local}) =>
  (type === 'ImportDefaultSpecifier' || type === 'ImportNamespaceSpecifier') &&
  local.name === FOLD_SYNC

// A default or namespace import bound as foldSync occupies the name: it may
// not be the named export and is not callable, so no suggestion is offered.
const foldSyncNameOccupied = sourceCode =>
  pipeleanImports(sourceCode).some(
    declaration => declaration.specifiers.some(isOccupiedFoldSync)
  )

// An existing (possibly aliased) foldSync binding wins.
const calleeReplacement = sourceCode => {
  const specifier = findFoldSyncSpecifier(pipeleanImports(sourceCode))
  return specifier ? specifier.local.name : FOLD_SYNC
}

// Prefer the named import that already binds reduceSync.
const importTarget = declarations => {
  const named = declarations.filter(
    declaration => namedSpecifiers(declaration).length > 0
  )
  const withReduce = named.find(declaration =>
    namedSpecifiers(declaration).some(isReduceSyncSpecifier))

  return withReduce || named[0] || null
}

const foldSyncImportInsert = (fixer, sourceCode) => {
  const declarations = pipeleanImports(sourceCode)
  if (findFoldSyncSpecifier(declarations))
    return null

  const target = importTarget(declarations)
  if (!target)
    return null

  const specifiers = namedSpecifiers(target)
  const anchor = specifiers.find(isReduceSyncSpecifier) || specifiers.at(-1)

  return fixer.insertTextAfter(anchor, `, ${FOLD_SYNC}`)
}

export {calleeReplacement, foldSyncImportInsert, foldSyncNameOccupied}
