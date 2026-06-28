export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer series() over array.map() with async callback',
    },
    messages: {
      preferSeries:
        'Use pipelean series(items, fn) instead of .map(async x => ...). ' +
        '.map() with async creates unhandled promises without error handling',
    },
  },
  create (context) {
    return {
      CallExpression (node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.computed ||
          node.callee.property.name !== 'map'
        )
          return

        const [callback] = node.arguments
        if (
          callback &&
          (callback.type === 'ArrowFunctionExpression' ||
            callback.type === 'FunctionExpression') &&
            callback.async
        ) {
          context.report({node, messageId: 'preferSeries'})
        }
      },
    }
  },
}
