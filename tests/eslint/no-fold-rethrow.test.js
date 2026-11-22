import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-fold-rethrow.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

const fixed = output => ({
  messageId: 'preferFoldSync',
  suggestions: [{messageId: 'replaceWithFoldSync', output}],
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
      code: 'reduceSync(a, f, z, {strategy: rethrow})',
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
  ],
})
