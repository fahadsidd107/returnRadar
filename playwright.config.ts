import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/playwright',workers:1,timeout:30000,
 use:{baseURL:'http://localhost:4173',channel:process.env.PLAYWRIGHT_CHANNEL||undefined,trace:'retain-on-failure'},
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/web',url:'http://localhost:4173',reuseExistingServer:!process.env.CI},
});
