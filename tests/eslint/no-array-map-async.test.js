import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-array-map-async.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-array-map-async', rule, {
  valid: [
    {code: 'items.map(x => x * 2)'},
    {code: 'items.map(fn)'},
    {code: 'series(items, fn)'},
    {code: 'items.filter(x => x.active)'},
  ],
  invalid: [
    {
      code: 'items.map(async x => await process(x))',
      errors: [{messageId: 'preferSeries'}],
    },
    {
      code: 'getItems().map(async function(item) { return await fetch(item) })',
      errors: [{messageId: 'preferSeries'}],
    },
  ],
})
