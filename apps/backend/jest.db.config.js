/** Opt-in, read-only tests against the real DB: `npm run test:db`. */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.db-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  // Tests always use the workspace package's source (no stale dist).
  moduleNameMapper: { '^@quran/text-utils$': '<rootDir>/../../packages/text-utils/src' },
  setupFiles: ['<rootDir>/test/setup-db-env.ts'],
};
