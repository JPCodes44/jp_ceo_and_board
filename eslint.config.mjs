// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: ['**/node_modules/**', 'dist/**', '.dist/**', 'tree.md'],
  },
  {
    // Optional: Add type-checked rules if you need more powerful linting
    // ...tseslint.configs.recommendedTypeChecked,
    languageOptions: {
      parserOptions: {
        // If using type-aware rules, you need to configure how to find tsconfig
        // projectService: true,
        // tsconfigRootDir: import.meta.dirname,
      },
    },
    // Optional: add specific rules or override existing ones
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow intentionally-unused params/vars when prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
