import plugin from './plugin.js'

export default {
  name: 'pipelean',
  plugins: {
    pipelean: plugin,
  },
  rules: {
    'pipelean/no-array-foreach': 'warn',
    'pipelean/no-array-reduce': 'warn',
    'pipelean/no-promise-combinators': 'warn',
    'pipelean/no-for-await-of': 'warn',
    'pipelean/no-array-map-async': 'warn',
    'pipelean/no-loop-without-yield': 'warn',
  },
}
