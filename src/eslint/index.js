import noArrayForeach from './rules/no-array-foreach.js'
import noArrayReduce from './rules/no-array-reduce.js'

export default {
  meta: {name: 'pipelean'},
  rules: {
    'no-array-foreach': noArrayForeach,
    'no-array-reduce': noArrayReduce,
  },
}
