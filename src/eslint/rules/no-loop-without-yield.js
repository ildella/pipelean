const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

const isNode = value =>
  value && typeof value === 'object' && typeof value.type === 'string'

const SKIP_KEYS = new Set([
  'parent',
  'loc',
  'range',
  'start',
  'end',
  'tokens',
  'comments',
])

const visitChildren = (current, visit) => {
  for (const key of Object.keys(current)) {
    if (SKIP_KEYS.has(key))
      continue

    const value = current[key]
    if (!value)
      continue

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child))
          visit(child)
      }
    } else if (isNode(value)) {
      visit(value)
    }
  }
}

const hasYieldExpression = node => {
  let found = false

  const visit = current => {
    if (!current || found)
      return

    if (current.type === 'YieldExpression') {
      found = true
      return
    }

    if (current !== node && FUNCTION_TYPES.has(current.type))
      return

    visitChildren(current, visit)
  }

  visit(node)

  return found
}

const isInsideGenerator = (node, context) => {
  const ancestors = context.sourceCode.getAncestors(node)

  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i]
    if (FUNCTION_TYPES.has(ancestor.type)) {
      return ancestor.generator
    }
  }

  return false
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer pipelean except when loops implement generators',
    },
    messages: {
      preferPipelean:
        'Prefer pipelean / functional iteration. ' +
        'Loops are allowed only inside generators that yield.',
    },
  },

  create (context) {
    const reportIfNotAllowed = node => {
      if (
        hasYieldExpression(node.body) &&
        isInsideGenerator(node, context)
      ) {
        return
      }

      context.report({node, messageId: 'preferPipelean'})
    }

    return {
      ForStatement: reportIfNotAllowed,
      ForInStatement: reportIfNotAllowed,
      ForOfStatement: reportIfNotAllowed,
      WhileStatement: reportIfNotAllowed,
      DoWhileStatement: reportIfNotAllowed,
    }
  },
}
