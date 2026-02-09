// PM2 Ecosystem File
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: "llm-hub",
      script: "npm",
      args: "start",
      cwd: "/opt/llm-hub/app",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "/var/log/llm-hub/error.log",
      out_file: "/var/log/llm-hub/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
