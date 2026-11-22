import {RuleTester} from 'eslint'
import rule from '$src/eslint/rules/no-fold-rethrow.js'

const tester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
})

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
      errors: [{messageId: 'preferFoldSync'}],
    },
    {
      code: 'reduceSync(a, f, z, {strategy: \'throw\'})',
      errors: [{messageId: 'preferFoldSync'}],
    },
    {
      code: 'reduceSync(a, f, z, {onError: e, strategy: rethrow})',
      errors: [{messageId: 'preferFoldSync'}],
    },
    {
      code:
        'reduceSync(items, (acc, x) => acc + x, 0, ' +
        '{strategy: rethrow}).value',
      errors: [{messageId: 'preferFoldSync'}],
    },
  ],
})
