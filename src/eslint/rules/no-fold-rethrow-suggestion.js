/**
 * Call-shape suggestion machinery for no-fold-rethrow. The report-only
 * shapes and residual evasion are documented in the rule header.
 */
import {
  calleeReplacement,
  foldSyncImportInsert,
  foldSyncNameOccupied,
} from './no-fold-rethrow-import.js'

const VALUE_PROPERTY = 'value'

const PATTERN_WRAPPERS = new Set([
  'Property',
  'ObjectPattern',
  'ArrayPattern',
  'AssignmentPattern',
  'SpreadElement',
  'RestElement',
])

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

const isValueAccess = member =>
  !member.computed && member.property.type === 'Identifier' &&
  member.property.name === VALUE_PROPERTY

const memberAccess = node => {
  const {parent} = node
  const isMember = parent?.type === 'MemberExpression' && parent.object === node
  return isMember ? parent : null
}

const isPatternNode = node =>
  node.type === 'ObjectPattern' || node.type === 'ArrayPattern'

const destructuresResult = node => {
  const {parent} = node
  if (!parent)
    return false

  if (parent.type === 'VariableDeclarator')
    return parent.init === node && isPatternNode(parent.id)

  const isAssignment =
    parent.type === 'AssignmentExpression' ||
    parent.type === 'AssignmentPattern'
  return isAssignment && parent.right === node && isPatternNode(parent.left)
}

const isForInOrOf = parent =>
  parent.type === 'ForInStatement' || parent.type === 'ForOfStatement'

const isDirectWrite = member => {
  const {parent} = member
  if (!parent)
    return false

  if (parent.type === 'AssignmentExpression')
    return parent.left === member

  if (parent.type === 'UpdateExpression')
    return parent.argument === member

  if (parent.type === 'UnaryExpression')
    return parent.operator === 'delete'

  if (isForInOrOf(parent))
    return parent.left === member

  return false
}

const patternRoot = node => {
  let current = node
  while (PATTERN_WRAPPERS.has(current.parent?.type))
    current = current.parent

  return current
}

const isPatternWrite = member => {
  const root = patternRoot(member)
  const {parent} = root
  if (!parent)
    return false

  if (parent.type === 'AssignmentExpression')
    return parent.left === root

  if (parent.type === 'VariableDeclarator')
    return parent.id === root

  if (parent.type === 'CatchClause')
    return parent.param === root

  if (isForInOrOf(parent))
    return parent.left === root

  if (FUNCTION_TYPES.has(parent.type))
    return parent.params.includes(root)

  return false
}

const isWriteTarget = member =>
  isDirectWrite(member) || isPatternWrite(member)

const hasExtraArgument = node => node.arguments.length > 4

const reportOnly = (node, sourceCode) => {
  if (hasExtraArgument(node) || foldSyncNameOccupied(sourceCode))
    return true

  const member = memberAccess(node)
  if (!member)
    return destructuresResult(node)

  return !isValueAccess(member) || isWriteTarget(member)
}

const commaRange = (sourceCode, node) => {
  const third = node.arguments[2]
  const opts = node.arguments[3]
  return [sourceCode.getLastToken(third).range[1], opts.range[1]]
}

const suggestionFixes = (fixer, sourceCode, node) => {
  const member = memberAccess(node)
  const fixes = [
    fixer.replaceText(node.callee, calleeReplacement(sourceCode)),
    fixer.removeRange(commaRange(sourceCode, node)),
  ]

  if (member)
    fixes.push(fixer.removeRange([node.range[1], member.range[1]]))

  const insert = foldSyncImportInsert(fixer, sourceCode)
  if (insert)
    fixes.push(insert)

  return fixes
}

export {reportOnly, suggestionFixes}
