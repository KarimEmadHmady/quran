/**
 * Opt-in tests that WRITE (Phase 6 admin CRUD): `npm run test:write-db`.
 * They only ever run against the isolated "<db>_test" database (see test/setup-test-db-env.ts
 * and `npm run db:test:create`); the real database in DATABASE_URL is never touched.
 */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\.write-db-spec\.ts$',
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: { '^@quran/text-utils$': '<rootDir>/../../packages/text-utils/src' },
  setupFiles: ['<rootDir>/test/setup-test-db-env.ts'],
};
