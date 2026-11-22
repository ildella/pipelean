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
    // recover + rethrow is a managed use: onError fires before the seam.
    {code: 'reduceSync(a, f, z, {strategy: rethrow, recover: r})'},
    {code: 'reduceSync(a, f, z, {recover: r, strategy: \'throw\'})'},
    {code: 'reduceSync(a, f, z, {recover: r})'},
    // Raw async use is the supported home for rethrow.
    {code: 'series(a, f, {strategy: rethrow})'},
    {code: 'scan(a, f, z, {strategy: rethrow})'},
    {code: 'reduce(a, f, z, {strategy: rethrow})'},
    {code: 'filter(a, p, {strategy: rethrow})'},
    // Documented limitation: aliased calls and member expressions evade.
    {code: 'rs(a, f, z, {strategy: rethrow})'},
    {code: 'pipelean.reduceSync(a, f, z, {strategy: rethrow})'},
  ],
  invalid: [
    {
      // The report is consumed: no safe 1:1 rewrite, report only.
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
      // Assignment destructuring: foldSync would throw on a primitive acc.
      code: '({value} = reduceSync(a, f, z, {strategy: rethrow}))',
      errors: [reportOnly],
    },
    {
      // Parameter default that destructures the result.
      code:
        'function f({value} = reduceSync(a, f, z, ' +
        '{strategy: rethrow})) {}',
      errors: [reportOnly],
    },
    {
      // .value as an assignment target.
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
      // .value inside a destructuring assignment pattern.
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
      // .value nested in an object pattern on a for-of left (write target).
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
      // Array-pattern left is a write target too.
      code:
        'for ([reduceSync(a, f, z, {strategy: rethrow}).value] of xs) {}',
      errors: [reportOnly],
    },
    {
      // `for await` is the same node type with the await flag set.
      code:
        'async function g () { for await ' +
        '({x: reduceSync(a, f, z, {strategy: rethrow}).value} of xs) {} }',
      errors: [reportOnly],
    },
    {
      // A default import named foldSync occupies the binding: no suggestion.
      code:
        'import foldSync from \'pipelean\'\n' +
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [reportOnly],
    },
    {
      // A namespace import named foldSync is not callable either.
      code:
        'import * as foldSync from \'pipelean\'\n' +
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [reportOnly],
    },
    {
      // foldSync has no home for a fifth argument.
      code: 'reduceSync(a, f, z, {strategy: rethrow}, extra)',
      errors: [reportOnly],
    },
  ],
})
