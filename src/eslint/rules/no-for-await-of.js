export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer series() over for await...of with try/catch',
    },
    messages: {
      preferSeries: 'Use pipelean series(items, fn) instead of for await...of',
    },
  },
  create (context) {
    return {
      ForOfStatement (node) {
        if (node.await) {
          context.report({node, messageId: 'preferSeries'})
        }
      },
    }
  },
}
