import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Workspace packages like @dave/discord-kit are authored as NodeNext-style
  // ESM TS source (relative imports use explicit ".js" specifiers that
  // resolve to sibling ".ts" files at the TS/Bun level). Webpack's default
  // resolver doesn't know that convention, so barrel re-exports like
  // `export { x } from './y.js'` fail to resolve when bundled for the
  // client. This teaches webpack to also try ".ts"/".tsx" when a ".js"
  // specifier is requested.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
