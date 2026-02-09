/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: "standalone" is only for production Docker builds
  // Enable it only when building: NEXT_OUTPUT=standalone npm run build
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
