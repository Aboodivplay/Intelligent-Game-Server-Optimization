import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Check the UI contract for registering each supported mod loader and game version.
// Run this from the same checkout as the four published JAR files and collector.zip.
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4173';
const browser = await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL || 'chrome'});
try {
  for (const loader of ['Forge','Fabric']) {
    for (const version of ['1.20.1','1.21.4','26.3']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const serverId = '06aa639b-ac53-4cb6-b2af-7ad7655d04ce';
      const serverName = loader + ' ' + version + ' test server';
      const fixtureKey = 'b'.repeat(64);
      let server;
      let sample;
      await page.route('**/api/**', async route => {
        const req=route.request();
        const path=new URL(req.url()).pathname;
        if (path === '/api/auth/me') return route.fulfill({json:{user:{id:'owner',name:'Admin'}}});
        if (path === '/api/dashboard') return route.fulfill({json:{servers:server?[server]:[],telemetry:sample?[sample]:[],audit:[],commands:[],playerStates:[]}});
        if (path === '/api/servers' && req.method() === 'POST') {
          const fields = req.postDataJSON();
          assert.deepEqual(fields,{name:serverName,minecraftVersion:version,loader});
          server = {id:serverId,...fields,threshold:80,manualOverride:false,online:false};
          return route.fulfill({status:201,json:{server,agentKey:fixtureKey}});
        }
        if (path === '/api/servers/'+serverId && req.method() === 'PATCH') {
          const changes = req.postDataJSON();
          assert.equal(changes.minecraftVersion, '26.1.2');
          server = {...server, ...changes};
          return route.fulfill({json:{server}});
        }
        return route.fulfill({status:404,json:{error:'Unexpected fixture request'}});
      });
      await page.goto(origin+'/#minecraft');
      await page.locator('#connect-server').click();
      await page.getByLabel('Server name').fill(serverName);
      await page.getByLabel('Server software').selectOption(loader);
      await page.getByLabel('Minecraft version').selectOption(version);
      await page.getByRole('button',{name:'Create connection'}).click();
      const modal=page.getByRole('dialog');
      await modal.getByRole('heading',{name:'Save your agent configuration'}).waitFor();
      const configuration=await modal.locator('pre').innerText();
      assert.ok(configuration.includes('server-id='+serverId) && configuration.includes('agent-key='+fixtureKey));
      assert.match(configuration,/interval-seconds=2/);
      const download=page.waitForEvent('download');
      await modal.getByRole('button',{name:'Download igso.properties'}).click();
      assert.equal((await download).suggestedFilename(),'igso.properties');
      await modal.getByRole('button',{name:'Close'}).click();
      if (version === '1.21.4') {
        await page.getByRole('heading',{name:loader+' '+version+' setup'}).waitFor();
        assert.equal(await page.locator('#content a[href$=".jar"]').count(),0);
        await page.getByRole('button',{name:'Open Settings'}).click();
        await page.getByLabel('Minecraft version').selectOption('26.1.2');
        await page.getByRole('button',{name:'Save policy'}).click();
        await page.getByText('Server policy saved.').waitFor();
        await page.reload();
        await page.getByRole('button',{name:'Settings',exact:true}).click();
        assert.equal(await page.getByLabel('Minecraft version').inputValue(),'26.1.2');
        await page.getByRole('button',{name:'Agent setup',exact:true}).click();
        await page.getByRole('heading',{name:loader+' 26.1.2 setup'}).waitFor();
        assert.deepEqual(errors,[]);
        await page.close();
        continue;
      }
      await page.getByRole('heading',{name:loader+' '+version+' monitoring'}).waitFor();
      const filename='igso-'+loader.toLowerCase()+'-'+version+'.jar';
      const jar=page.getByRole('link',{name:filename,exact:true});
      assert.equal(await jar.getAttribute('href'),'mods/'+filename);
      const collector=page.getByRole('link',{name:'Download SQLite collector'});
      assert.equal(await collector.getAttribute('href'),'collector.zip');
      // These static downloads must resolve to ZIP/JAR bytes, not an HTML fallback.
      for (const link of [jar,collector]) {
        const response=await page.request.get(new URL(await link.getAttribute('href'),origin+'/').href);
        assert.equal(response.status(),200);
        assert.equal((await response.body()).readUInt32LE(0),0x04034b50);
      }
      sample={timestamp:new Date().toISOString(),cpu:12.5,memory:30,tps:19.98,mspt:26.7,
        entities:11,players:1,memoryUsedMb:150,memoryMaxMb:500,platform:loader,minecraftVersion:version};
      server={...server,online:true,lastSeen:sample.timestamp};
      await page.reload();
      await page.getByText('Tick time',{exact:true}).waitFor();
      assert.match(await page.locator('.metric').filter({hasText:'Tick time'}).innerText(),/26\.7\s*ms/);
      assert.deepEqual(errors,[]);
      await page.close();
      console.log(loader+' '+version+' registration, configuration, downloads and tick time passed.');
    }
  }
} finally { await browser.close(); }
