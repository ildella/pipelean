/**
 * Disallow reduceSync with strategy: rethrow used as a value extractor.
 *
 * `reduceSync(items, reducer, initial, {strategy: rethrow}).value` is
 * behavior-identical to `foldSync(items, reducer, initial)` for a pure sync
 * fold, but pays for a managed report nobody reads.
 *
 * Deliberately narrow: only bare `reduceSync(...)` calls whose 4th argument
 * is an inline ObjectExpression are reported. `recover` in the same opts
 * exempts the call (onError fires before the recovery seam, so migrating would
 * drop recovery); async reduce/series/filter/scan with rethrow are never
 * reported; aliased imports and member calls (`pipelean.reduceSync(...)`)
 * evade detection on purpose, since resolving bindings would drag in
 * re-exports, computed keys and spread opts for little gain.
 *
 * The suggestion renames the callee to `foldSync` and drops the 4th argument
 * plus its comma. When the report is read only through `.value` (the
 * migration codemod shape) that access is dropped too:
 * `reduceSync(a, f, z, opts).value` becomes `foldSync(a, f, z)`. Not
 * cosmetic: foldSync returns the raw accumulated value, so
 * `foldSync(...).value` would read a property it does not have. Any other
 * report shape is still reported but gets no suggestion: no safe 1:1 rewrite.
 *
 * `foldSync` is added to an existing named `pipelean` import when missing;
 * `reduceSync` is never removed (it may be used elsewhere). Without a named
 * `pipelean` import only the call is rewritten, leaving the callee
 * unresolved until the author adds it. Opt-in on purpose: import edits make
 * blind `--fix` unsafe.
 */
const FOLD_SYNC = 'foldSync'
const REDUCE_SYNC = 'reduceSync'
const PIPLEAN_SOURCE = 'pipelean'
const VALUE_PROPERTY = 'value'

const propertyName = property => {
  if (property.type !== 'Property' || property.computed)
    return null

  const {key} = property
  return key.type === 'Identifier' ? key.name : key.value
}

const isRethrowValue = value =>
  (value.type === 'Identifier' && value.name === 'rethrow') ||
  (value.type === 'Literal' && value.value === 'throw')

const hasKey = (name, opts) =>
  opts.properties.some(property => propertyName(property) === name)

const hasRethrowStrategy = opts =>
  opts.properties.some(
    property =>
      propertyName(property) === 'strategy' &&
      isRethrowValue(property.value)
  )

const isBareReduceSyncCall = node =>
  node.callee.type === 'Identifier' && node.callee.name === REDUCE_SYNC

const isValueExtraction = node => {
  const opts = node.arguments[3]
  const isOpts = Boolean(opts) && opts.type === 'ObjectExpression'
  if (!isOpts || !hasRethrowStrategy(opts))
    return false

  return !hasKey('recover', opts)
}

const isValueAccess = member =>
  !member.computed && member.property.type === 'Identifier' &&
  member.property.name === VALUE_PROPERTY

const memberAccess = node => {
  const {parent} = node
  const isMember = parent?.type === 'MemberExpression' && parent.object === node
  return isMember ? parent : null
}

const destructuresResult = node => {
  const {parent} = node
  if (!parent || parent.type !== 'VariableDeclarator' || parent.init !== node)
    return false

  return parent.id.type === 'ObjectPattern' || parent.id.type === 'ArrayPattern'
}

// The report is consumed in a shape a raw value cannot satisfy.
const reportShapeInUse = node => {
  const member = memberAccess(node)
  return member ? !isValueAccess(member) : destructuresResult(node)
}

const isPipeleanImport = ({type, source}) =>
  type === 'ImportDeclaration' && source.value === PIPLEAN_SOURCE

const foldSyncImportFix = (fixer, sourceCode) => {
  const declaration = sourceCode.ast.body.find(isPipeleanImport)
  if (!declaration)
    return null

  const specifiers = declaration.specifiers.filter(
    ({type}) => type === 'ImportSpecifier'
  )
  const hasFoldSync = specifiers.some(
    ({imported}) => imported.name === FOLD_SYNC
  )
  if (specifiers.length === 0 || hasFoldSync)
    return null

  const anchor =
    specifiers.find(({imported}) => imported.name === REDUCE_SYNC) ||
    specifiers.at(-1)

  return fixer.insertTextAfter(anchor, `, ${FOLD_SYNC}`)
}

const suggestionFixes = (fixer, sourceCode, node) => {
  const opts = node.arguments[3]
  const comma = sourceCode.getTokenBefore(opts)
  const member = memberAccess(node)
  const fixes = [
    fixer.replaceText(node.callee, FOLD_SYNC),
    fixer.removeRange([comma.range[0], opts.range[1]]),
  ]
  if (member)
    fixes.push(fixer.removeRange([node.range[1], member.range[1]]))

  const importFix = foldSyncImportFix(fixer, sourceCode)
  if (importFix)
    fixes.push(importFix)

  return fixes
}

export default {
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    docs: {
      description:
        'Disallow reduceSync with strategy: rethrow for value ' +
        'extraction; prefer foldSync',
    },
    messages: {
      preferFoldSync:
        'foldSync(items, reducer, initial) returns the value directly. ' +
        'Use it for a pure sync fold; keep reduceSync and assertOk when ' +
        'you need the report.',
      replaceWithFoldSync:
        'Replace with foldSync(items, reducer, initial)',
    },
  },

  create (context) {
    const {sourceCode} = context

    return {
      CallExpression (node) {
        if (!isBareReduceSyncCall(node) || !isValueExtraction(node))
          return

        const report = {node, messageId: 'preferFoldSync'}
        if (reportShapeInUse(node)) {
          context.report(report)
          return
        }

        context.report({
          ...report,
          suggest: [
            {
              messageId: 'replaceWithFoldSync',
              fix: fixer => suggestionFixes(fixer, sourceCode, node),
            },
          ],
        })
      },
    }
  },
}
