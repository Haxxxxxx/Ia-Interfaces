// ../app/next.config.mjs
var nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};
var next_config_default = nextConfig;
export {
  next_config_default as default
};
