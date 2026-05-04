import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-for-await-of.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-for-await-of', rule, {
  valid: [
    {code: 'for (const item of items) { process(item) }'},
    {code: 'series(items, fn)'},
    {code: 'items.forEach(fn)'},
  ],
  invalid: [
    {
      code: 'for await (const item of items) { await process(item) }',
      errors: [{messageId: 'preferSeries'}],
    },
    {
      code: 'for await (const x of getItems()) { await handle(x) }',
      errors: [{messageId: 'preferSeries'}],
    },
  ],
})
