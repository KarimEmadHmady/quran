/** Default test run (`npm test`): unit + e2e, no real database. */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  // Real-DB tests are opt-in only (`npm run test:db`, see jest.db.config.js).
  testPathIgnorePatterns: ['/node_modules/', '\\.db-spec\\.ts$'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  // Tests always use the workspace package's source (no stale dist).
  moduleNameMapper: { '^@quran/text-utils$': '<rootDir>/../../packages/text-utils/src' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
};
