import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Separate output folder for test builds (e2e) so they never touch the dev/prod build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
