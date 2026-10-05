const createNoArrayMethodRule = ({
  method, description, messageId, message,
}) => ({
  meta: {
    type: 'suggestion',
    docs: {description},
    messages: {[messageId]: message},
  },
  create (context) {
    return {
      CallExpression (node) {
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property.name === method
        ) {
          context.report({node, messageId})
        }
      },
    }
  },
})

export default createNoArrayMethodRule
