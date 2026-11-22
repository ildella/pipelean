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
      // Whitespace before the comma is swallowed with it.
      code: 'reduceSync(a, f, z , {strategy: rethrow})',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      // No pipelean import: the call is rewritten, no import is added.
      code: 'reduceSync(a, f, z, {strategy: \'throw\'}).value',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      // The migration codemod shape: `.value` goes with the options.
      code:
        'reduceSync(items, (acc, x) => acc + x, 0, ' +
        '{strategy: rethrow}).value',
      errors: [fixed('foldSync(items, (acc, x) => acc + x, 0)')],
    },
    {
      // A read binding keeps the `.value` drop.
      code: 'const v = reduceSync(a, f, z, {strategy: rethrow}).value',
      errors: [fixed('const v = foldSync(a, f, z)')],
    },
    {
      // A longer read chain keeps the rest.
      code: 'reduceSync(a, f, z, {strategy: rethrow}).value.toString()',
      errors: [fixed('foldSync(a, f, z).toString()')],
    },
    {
      // Optional access is a read too.
      code: 'reduceSync(a, f, z, {strategy: rethrow})?.value',
      errors: [fixed('foldSync(a, f, z)')],
    },
    {
      // A plain default value is a read: the suggestion is safe.
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
      // Aliased binding: the local name is irrelevant, foldSync is added.
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
      // foldSync is already bound in a second import: no insertion.
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
      // Namespace import first must not hide the later named import.
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
      // Aliased foldSync: the call uses its local name, nothing inserted.
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
      // Namespace/default only: call-only rewrite, documented limitation.
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
