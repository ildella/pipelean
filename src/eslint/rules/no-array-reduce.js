import createNoArrayMethodRule from './create-no-array-method-rule.js'

export default createNoArrayMethodRule({
  method: 'reduce',
  description:
    'Prefer pipelean foldSync() for a pure sync fold, or reduce() when ' +
    'you need the report, over Array.prototype.reduce',
  messageId: 'preferFold',
  message:
    'Use pipelean foldSync(items, reducer, initial) for a pure sync fold, ' +
    'or reduce(items, reducer, initial) when you need the report, over ' +
    '.reduce()',
})
