import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocalEnv } from './scripts/local-env';
loadLocalEnv();
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('.tools/playwright')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve('.tools/playwright');
}
export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1,
  use:{ baseURL:process.env.APP_BASE_URL || 'http://localhost:3000', headless:true },
  webServer:{ command:'npm run dev', url:process.env.APP_BASE_URL || 'http://localhost:3000', reuseExistingServer:!process.env.CI, timeout:90000 },
});
