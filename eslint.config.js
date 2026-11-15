import tseslint from 'typescript-eslint';

/** APIs forbidden in deterministic simulation packages. */
const banned = [
  ['Math', 'random'],
  ['Math', 'sin'],
  ['Math', 'cos'],
  ['Math', 'pow'],
  ['Math', 'exp'],
  ['Math', 'hypot'],
  ['Date', 'now'],
  ['performance', 'now'],
].map(([object, property]) => ({
  object,
  property,
  message: `${object}.${property} is not allowed in deterministic simulation code; use the seeded PRNG, tick counts, Math.sqrt, or the committed sine table.`,
}));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.render/**',
      'packages/anim/**',
      'artifacts/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: [
      'packages/engine/src/**/*.ts',
      'packages/physics/src/**/*.ts',
      'packages/core/src/**/*.ts',
      'packages/contracts/src/**/*.ts',
    ],
    rules: {
      'no-restricted-properties': ['error', ...banned],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
