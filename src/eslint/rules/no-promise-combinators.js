const METHODS = {
  all: 'preferSeries',
  allSettled: 'preferSeriesCollect',
  any: 'preferSeriesAny',
  race: 'preferSeriesRace',
  try: 'preferTryCatch',
  withResolvers: 'preferPipeleanOverWithResolvers',
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer pipelean series() or tryCatch() over Promise combinators',
    },
    messages: {
      preferSeries: 'Use pipelean series(items, fn) instead of Promise.all()',
      preferSeriesCollect:
        'Use pipelean series(items, fn, {strategy: collect}) ' +
        'instead of Promise.allSettled()',
      preferSeriesAny:
        'Use pipelean series(items, fn) instead of Promise.any()',
      preferSeriesRace:
        'Use pipelean series(items, fn) instead of Promise.race()',
      preferTryCatch:
        'Use pipelean tryCatch(fn) instead of Promise.try()',
      preferPipeleanOverWithResolvers:
        'Avoid Promise.withResolvers() ' +
        '- prefer pipelean series() or tryCatch()',
    },
  },
  create (context) {
    return {
      CallExpression (node) {
        const {callee} = node
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'Promise'
        )
          return

        const messageId = METHODS[callee.property.name]
        if (messageId)
          context.report({node, messageId})
      },
    }
  },
}
