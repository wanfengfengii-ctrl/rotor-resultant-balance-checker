import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  reporter: "list",
  use: {
    baseURL,
  },
  // 未指定 PLAYWRIGHT_BASE_URL 时自动启动 Vite 开发服务器
  // （后端需已在本机 8000 端口运行，Vite 将 /api 代理过去）。
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
