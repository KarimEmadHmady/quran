/** Default test run (`npm test`): unit tests only, no database. */
/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  // Real-DB tests are opt-in only (`npm run test:db`, see jest.db.config.js).
  testPathIgnorePatterns: ['/node_modules/', '\\.db-spec\\.ts$'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
};
