import path from 'node:path'
import {includeIgnoreFile} from '@eslint/compat'
import {nostandard} from 'eslint-nostandard'
import vitest from 'eslint-nostandard/vitest'
import globals from 'globals'

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore')

const ignores = [
  'docs/*',
]

export default [
  includeIgnoreFile(gitignorePath),
  ...nostandard.recommended,
  vitest,
  {
    name: 'My new library',
    ignores,
    plugins: {},
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'complexity': ['warn', {max: 8}],
      'max-statements': ['warn', 25],
      'max-lines-per-function': ['warn', 80],
      'no-undefined': 'off',
    },
  },
  {
    name: 'ProductionCode',
    files: ['src/**/*.js'],
    rules: {},
  },
  {
    name: 'Tests',
    files: ['tests/**/*.js'],
    rules: {
      'max-lines': ['warn', 250],
    },
  },
]
