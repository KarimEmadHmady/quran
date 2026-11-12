// Import this FIRST in an e2e file that needs X-Forwarded-For to set the client IP.
// ConfigModule validates env when AppModule is imported, and each Jest test file has its own
// module registry, so this only affects the importing file.
process.env.TRUST_PROXY = 'loopback';
