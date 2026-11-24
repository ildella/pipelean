import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-fold-rethrow.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

const reportOnly = {messageId: 'preferFoldSync', suggestions: []}

tester.run('no-fold-rethrow', rule, {
  valid: [
    {code: 'reduceSync(a, f, z)'},
    {code: 'reduceSync(a, f, z, {})'},
    {code: 'reduceSync(a, f, z, {strategy: collect})'},
    {code: 'reduceSync(a, f, z, {strategy: failFast})'},
    {code: 'reduceSync(a, f, z, {strategy: failLate})'},
    {code: 'reduceSync(a, f, z, {strategy: skip})'},
    {code: 'reduceSync(a, f, z, {strategy: rethrow, recover: r})'},
    {code: 'reduceSync(a, f, z, {recover: r, strategy: \'throw\'})'},
    {code: 'reduceSync(a, f, z, {recover: r})'},
    {code: 'series(a, f, {strategy: rethrow})'},
    {code: 'scan(a, f, z, {strategy: rethrow})'},
    {code: 'reduce(a, f, z, {strategy: rethrow})'},
    {code: 'filter(a, p, {strategy: rethrow})'},
    {code: 'rs(a, f, z, {strategy: rethrow})'},
    {code: 'pipelean.reduceSync(a, f, z, {strategy: rethrow})'},
  ],
  invalid: [
    {
      code: 'reduceSync(a, f, z, {strategy: rethrow}).failure',
      errors: [reportOnly],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: rethrow})[\'value\']',
      errors: [reportOnly],
    },
    {
      code: 'const {value} = reduceSync(a, f, z, {strategy: rethrow})',
      errors: [reportOnly],
    },
    {
      code: 'const [first] = reduceSync(a, f, z, {strategy: rethrow})',
      errors: [reportOnly],
    },
    {
      code: '({value} = reduceSync(a, f, z, {strategy: rethrow}))',
      errors: [reportOnly],
    },
    {
      code:
        'function f({value} = reduceSync(a, f, z, ' +
        '{strategy: rethrow})) {}',
      errors: [reportOnly],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: rethrow}).value = 1',
      errors: [reportOnly],
    },
    {
      code: 'delete reduceSync(a, f, z, {strategy: rethrow}).value',
      errors: [reportOnly],
    },
    {
      code: '++reduceSync(a, f, z, {strategy: rethrow}).value',
      errors: [reportOnly],
    },
    {
      code:
        '({x: reduceSync(a, f, z, {strategy: rethrow}).value} = obj)',
      errors: [reportOnly],
    },
    {
      code:
        'for (reduceSync(a, f, z, {strategy: rethrow}).value of xs) {}',
      errors: [reportOnly],
    },
    {
      code:
        'for ({x: reduceSync(a, f, z, {strategy: rethrow}).value} of xs) {}',
      errors: [reportOnly],
    },
    {
      code:
        'for ({x: reduceSync(a, f, z, {strategy: rethrow}).value} in xs) {}',
      errors: [reportOnly],
    },
    {
      code:
        'for ([reduceSync(a, f, z, {strategy: rethrow}).value] of xs) {}',
      errors: [reportOnly],
    },
    {
      code:
        'async function g () { for await ' +
        '({x: reduceSync(a, f, z, {strategy: rethrow}).value} of xs) {} }',
      errors: [reportOnly],
    },
    {
      code:
        'import foldSync from \'pipelean\'\n' +
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [reportOnly],
    },
    {
      code:
        'import * as foldSync from \'pipelean\'\n' +
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [reportOnly],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: rethrow}, extra)',
      errors: [reportOnly],
    },
  ],
})
