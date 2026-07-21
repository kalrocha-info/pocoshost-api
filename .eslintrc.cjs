module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true
  },
  extends: ['standard'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  plugins: ['node'],
  rules: {
    // API payloads and PostgreSQL columns intentionally use snake_case.
    camelcase: 'off',
    'no-unused-vars': ['error', {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    'node/no-deprecated-api': 'error'
  },
  overrides: [
    {
      files: ['src/tests/**/*.js', 'test/**/*.js'],
      globals: {
        afterAll: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        test: 'readonly',
        vi: 'readonly'
      }
    }
  ]
}
