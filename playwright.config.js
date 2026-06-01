import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:  './tests',
  timeout:  30_000,
  workers:  1,        // extension context cannot run in parallel
  retries:  0,
  reporter: 'list',
});
