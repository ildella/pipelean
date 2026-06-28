import noArrayForeach from './rules/no-array-foreach.js'
import noArrayReduce from './rules/no-array-reduce.js'
import noPromiseCombinators from './rules/no-promise-combinators.js'
import noForAwaitOf from './rules/no-for-await-of.js'
import noArrayMapAsync from './rules/no-array-map-async.js'
import noLoopWithoutYield from './rules/no-loop-without-yield.js'

export default {
  meta: {name: 'pipelean'},
  rules: {
    'no-array-foreach': noArrayForeach,
    'no-array-reduce': noArrayReduce,
    'no-promise-combinators': noPromiseCombinators,
    'no-for-await-of': noForAwaitOf,
    'no-array-map-async': noArrayMapAsync,
    'no-loop-without-yield': noLoopWithoutYield,
  },
}
