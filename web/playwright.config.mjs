import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,retries:0,timeout:45000,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},
  {name:'webkit-mobile-emulation',use:{...devices['iPhone 13']}}],
 webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false}
});
