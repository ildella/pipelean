import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-loop-without-yield.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

tester.run('no-loop-without-yield', rule, {
  valid: [
    {
      code:
        'function * gen() { for (const item of items) ' +
        '{ yield transform(item) } }',
    },
    {
      code:
        'function * gen() { for (const item of items) ' +
        '{ yield * iterate(item) } }',
    },
    {
      code:
        'async function * gen() { for await (const item of items) ' +
        '{ yield transform(item) } }',
    },
    {
      code:
        'function * gen() { for (const folder of folders) ' +
        '{ yield folder; yield * iterateFolders(folder) } }',
    },
    {
      code: 'function * gen() { while (true) { yield next() } }',
    },
    {
      code: 'function * gen() { do { yield next() } while (true) }',
    },
    {
      code:
        'function * gen() { for (const key in obj) ' +
        '{ yield obj[key] } }',
    },
    {
      code:
        'function * gen() { for (let i = 0; i < n; i++) ' +
        '{ yield i } }',
    },
    {
      code: 'series(items, fn)',
    },
    {
      code: 'items.map(fn)',
    },
  ],

  invalid: [
    {
      code: 'for await (const item of items) { await process(item) }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code: 'for (const item of items) { process(item) }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code: 'while (cond) { doSomething() }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code: 'do { doSomething() } while (cond)',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code: 'for (let i = 0; i < n; i++) { doSomething(i) }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code: 'for (const key in obj) { doSomething(key) }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code:
        'function fn() { for (const item of items) ' +
        '{ process(item) } }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code:
        'async function fn() { for await (const item of items) ' +
        '{ await process(item) } }',
      errors: [{messageId: 'preferPipelean'}],
    },
    {
      code:
        'const fn = () => { for (const item of items) ' +
        '{ process(item) } }',
      errors: [{messageId: 'preferPipelean'}],
    },
  ],
})
