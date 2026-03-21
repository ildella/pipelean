export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer pipelean series() over Array.prototype.forEach',
    },
    messages: {
      preferSeries: 'Use pipelean series(items, fn) instead of .forEach(fn)',
    },
  },
  create (context) {
    return {
      CallExpression (node) {
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property.name === 'forEach'
        ) {
          context.report({node, messageId: 'preferSeries'})
        }
      },
    }
  },
}
