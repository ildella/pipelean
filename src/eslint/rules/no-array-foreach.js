import createNoArrayMethodRule from './create-no-array-method-rule.js'

export default createNoArrayMethodRule({
  method: 'forEach',
  description: 'Prefer pipelean series() over Array.prototype.forEach',
  messageId: 'preferSeries',
  message: 'Use pipelean series(items, fn) instead of .forEach(fn)',
})
