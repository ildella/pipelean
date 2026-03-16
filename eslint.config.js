import path from 'node:path'
import nostandard from 'eslint-nostandard'
import {includeIgnoreFile} from '@eslint/compat'
// import globals from 'globals'

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore')

const ignores = [
  'docs/*',
]

export default [
  includeIgnoreFile(gitignorePath),
  ...nostandard.configs.recommended,
  nostandard.configs.vitest,
  {
    name: 'My new library',
    ignores,
    plugins: {},
    languageOptions: {
      // globals: {
      //   ...globals.node,
      //   ...globals.browse,
      // },
    },
    rules: {},
  },
  {
    name: 'ProductionCode',
    files: ['src/**/*.js'],
    rules: {},
  },
  {
    name: 'Tests',
    files: ['tests/**/*.js'],
    rules: {},
  },
]
