import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-array-foreach.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-array-foreach', rule, {
  valid: [
    {code: 'series(items, fn)'},
    {code: 'items.map(fn)'},
    {code: 'items.filter(fn)'},
  ],
  invalid: [
    {code: 'items.forEach(fn)', errors: [{messageId: 'preferSeries'}]},
    {
      code: '[1, 2, 3].forEach(x => x)',
      errors: [{messageId: 'preferSeries'}],
    },
    {
      code: 'getItems().forEach(process)',
      errors: [{messageId: 'preferSeries'}],
    },
  ],
})
