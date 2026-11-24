const js = require('@eslint/js');
module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly',
        describe: 'readonly', test: 'readonly', expect: 'readonly', jest: 'readonly',
        beforeEach: 'readonly', __dirname: 'readonly',
      },
    },
  },
  { ignores: ['coverage/**', 'node_modules/**'] },
];
