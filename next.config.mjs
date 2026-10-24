/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // falkordb (via @redis/client) breaks when webpack bundles it ("a.BigInt is not a function"); load it from node_modules.
  experimental: { serverComponentsExternalPackages: ["falkordb", "@redis/client", "redis"] },
};

export default nextConfig;
