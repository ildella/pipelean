import createNoArrayMethodRule from './create-no-array-method-rule.js'

export default createNoArrayMethodRule({
  method: 'reduce',
  description: 'Prefer pipelean scan() over Array.prototype.reduce',
  messageId: 'preferScan',
  message: 'Use pipelean scan(items, reducer, initial) over .reduce()',
})
