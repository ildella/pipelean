export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer pipelean scan() over Array.prototype.reduce',
    },
    messages: {
      preferScan: 'Use pipelean scan(items, reducer, initial) over .reduce()',
    },
  },
  create (context) {
    return {
      CallExpression (node) {
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property.name === 'reduce'
        ) {
          context.report({node, messageId: 'preferScan'})
        }
      },
    }
  },
}
