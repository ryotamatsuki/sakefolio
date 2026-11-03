import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,retries:0,timeout:45000,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'https://127.0.0.1:4173',ignoreHTTPSErrors:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium-mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}},
  {name:'webkit-mobile-emulation',use:{...devices['iPhone 13']}}],
 webServer:{command:'node e2e/server.mjs',url:'https://127.0.0.1:4173',ignoreHTTPSErrors:true,reuseExistingServer:false}
});
