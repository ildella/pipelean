import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-fold-rethrow.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

const fixed = output => ({
  messageId: 'preferFoldSync',
  suggestions: [{messageId: 'replaceWithFoldSync', output}],
})

const call = 'reduceSync(a, f, z, {strategy: rethrow})'

tester.run('no-fold-rethrow fixer', rule, {
  valid: [],
  invalid: [
    {
      code: call,
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: \'throw\'})',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      code: 'reduceSync(a, f, z, {onError: e, strategy: rethrow})',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      code: 'reduceSync(a, f, z , {strategy: rethrow})',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: \'throw\'}).value',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      code:
        'reduceSync(items, (acc, x) => acc + x, 0, ' +
        '{strategy: rethrow}).value',
      errors: [fixed('foldSync(items, (acc, x) => acc + x, 0)')],
    },
    {
      code: 'const v = reduceSync(a, f, z, {strategy: rethrow}).value',
      errors: [fixed('const v = foldSync(a, f, z)')],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: rethrow}).value.toString()',
      errors: [fixed('foldSync(a, f, z).toString()')],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: rethrow})?.value',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      code: 'function f(x = reduceSync(a, f, z, {strategy: rethrow})) {}',
      errors: [fixed('function f(x = foldSync(a, f, z)) {}')],
    },
    {
      code:
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import {reduceSync, foldSync} from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import {foldSync, reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import {foldSync, reduceSync} from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow}).value',
      errors: [
        fixed(
          'import {reduceSync, foldSync} from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import {rethrow, reduceSync as rs} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import {rethrow, reduceSync as rs, foldSync} from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import {reduceSync} from \'pipelean\'\n' +
        'import {foldSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import {reduceSync} from \'pipelean\'\n' +
          'import {foldSync} from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import * as p from \'pipelean\'\n' +
        'import {reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import * as p from \'pipelean\'\n' +
          'import {reduceSync, foldSync} from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import {foldSync as fs, reduceSync} from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import {foldSync as fs, reduceSync} from \'pipelean\'\n' +
          'fs(a, f, z)'
        ),
      ],
    },
    {
      code:
        'import * as p from \'pipelean\'\n' +
        'reduceSync(a, f, z, {strategy: rethrow})',
      errors: [
        fixed(
          'import * as p from \'pipelean\'\n' +
          'foldSync(a, f, z)'
        ),
      ],
    },
  ],
})
