import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-promise-combinators.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2024, sourceType: 'module'},
})

tester.run('no-promise-combinators', rule, {
  valid: [
    {code: 'series(items, fn)'},
    {code: 'series(items, fn, {strategy: collect})'},
    {code: 'tryCatch(fn)'},
    {code: 'Promise.resolve(value)'},
    {code: 'Promise.reject(error)'},
    {code: 'obj.all(items)'},
    {code: 'obj.allSettled(items)'},
    {code: 'obj.race(promises)'},
    {code: 'Promise[variable](items)'},
  ],
  invalid: [
    {code: 'Promise.all([p1, p2])', errors: [{messageId: 'preferSeries'}]},
    {code: 'Promise.all(items.map(fn))', errors: [{messageId: 'preferSeries'}]},
    {
      code: 'Promise.allSettled([p1, p2])',
      errors: [{messageId: 'preferSeriesCollect'}],
    },
    {
      code: 'Promise.allSettled(items.map(fn))',
      errors: [{messageId: 'preferSeriesCollect'}],
    },
    {code: 'Promise.any([p1, p2])', errors: [{messageId: 'preferSeriesAny'}]},
    {code: 'Promise.any(promises)', errors: [{messageId: 'preferSeriesAny'}]},
    {code: 'Promise.race([p1, p2])', errors: [{messageId: 'preferSeriesRace'}]},
    {code: 'Promise.race(promises)', errors: [{messageId: 'preferSeriesRace'}]},
    {code: 'Promise.try(fn)', errors: [{messageId: 'preferTryCatch'}]},
    {
      code: 'Promise.try(() => fetch(url))',
      errors: [{messageId: 'preferTryCatch'}],
    },
    {
      code: 'Promise.withResolvers()',
      errors: [{messageId: 'preferPipeleanOverWithResolvers'}],
    },
  ],
})
