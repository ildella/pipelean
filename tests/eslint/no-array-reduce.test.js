import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-array-reduce.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-array-reduce', rule, {
  valid: [
    {code: 'scan(items, reducer, initial)'},
    {code: 'items.map(fn)'},
    {code: 'items.filter(fn)'},
  ],
  invalid: [
    {code: 'items.reduce(fn, 0)', errors: [{messageId: 'preferScan'}]},
    {
      code: '[1, 2, 3].reduce((acc, x) => acc + x, 0)',
      errors: [{messageId: 'preferScan'}],
    },
    {
      code: 'getItems().reduce(summarize, {})',
      errors: [{messageId: 'preferScan'}],
    },
  ],
})
