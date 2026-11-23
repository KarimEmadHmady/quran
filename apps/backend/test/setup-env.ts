// Runs before every test file (jest `setupFiles`), i.e. before AppModule is imported,
// because ConfigModule.forRoot validates env at import time. Dummy values only:
// tests must never depend on the developer's real .env or database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'mysql://test:test@localhost:3306/test';
process.env.WEB_ORIGIN ??= 'http://localhost:3000', 'https://knjhjpd9-3000.eun1.devtunnels.ms';
process.env.JWT_SECRET ??= 'test-only-jwt-secret-0123456789abcdef';
