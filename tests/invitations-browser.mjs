import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// The owner and observer use separate browser sessions; only the API is substituted.
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:4173';
const server = { id: 'ab6c023a-6fcb-40ee-a294-e6dbcc26fabb', name: 'QA server',
  loader: 'Forge', minecraftVersion: '1.20.1', threshold: 80, manualOverride: false, online: false };
const recipient = 'player@example.invalid';
const code = '99999999-88888888-77777777-66666666';
const base = '/api/servers/' + server.id + '/invitations';
let invite;
let unexpected = [];

async function attach(page, owner) {
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const reply = (json, status = 200) => route.fulfill({status,json});
    if (path === '/api/auth/me') return reply({user:{id:owner ? 'owner' : 'member',name:owner ? 'Admin' : 'Player',email:owner ? 'admin@example.invalid' : recipient}});
    if (path === '/api/dashboard') return reply({servers:owner ? [server] : [], telemetry:[], audit:[], commands:[], playerStates:[]});
    if (owner && path === base && method === 'GET') return reply({invitations:invite ? [invite] : []});
    if (owner && path === base && method === 'POST') {
      const body = req.postDataJSON();
      assert.equal(body.email,recipient);
      assert.deepEqual(body.scopes,['overview']);
      invite = {id:'f65542a0-fa18-49ed-a935-4b9dfabee430',email:recipient,scopes:body.scopes,active:false,expiresAt:new Date(Date.now()+86400000).toISOString()};
      return reply({code},201);
    }
    if (owner && invite && path === base + '/' + invite.id && method === 'PATCH') {
      invite.scopes=req.postDataJSON().scopes; return reply({saved:true});
    }
    if (owner && invite && path === base + '/' + invite.id && method === 'DELETE') { invite=null; return reply({saved:true}); }
    if (!owner && path === '/api/invitations/redeem' && method === 'POST') {
      if (req.postDataJSON().code !== code || !invite || invite.active) return reply({error:'This invitation is invalid or unavailable.'},400);
      invite.active=true; return reply({serverId:server.id});
    }
    if (path === '/api/shared') return reply({servers:!owner && invite?.active ? [{id:server.id,name:server.name}] : []});
    if (!owner && invite?.active && path === '/api/shared/' + server.id) {
      return reply({id:server.id,name:server.name,online:true,scopes:invite.scopes,
        telemetry:invite.scopes.some(s=>s==='overview'||s==='history') ? [{timestamp:'2026-11-24T12:00:00Z',cpu:12,memory:30,tps:20,mspt:22}] : [],playerCount:invite.scopes.includes('players') ? 2 : null});
    }
    unexpected.push(method + ' ' + path); return reply({error:'Unexpected fixture request'},404);
  });
}

const browser = await chromium.launch({channel: process.env.TEST_BROWSER_CHANNEL || 'chrome'});
try {
  const owner = await browser.newPage();
  const player = await browser.newPage();
  await Promise.all([attach(owner,true),attach(player,false)]);
  await owner.goto(origin + '/#minecraft');
  await owner.getByRole('button',{name:'Settings',exact:true}).click();
  await owner.getByRole('button',{name:'Manage player access'}).click();
  await owner.locator('#invite-email').fill(recipient);
  await owner.getByRole('button',{name:'Create one-use code'}).click();
  await owner.getByText(code,{exact:true}).waitFor();
  await owner.getByRole('button',{name:'Done'}).click();

  await player.goto(origin + '/#games');
  await player.getByRole('link',{name:/Shared servers/}).click();
  await player.locator('#invite-code').fill(code);
  await player.getByRole('button',{name:'Redeem invitation'}).click();
  await player.getByRole('heading',{name:'Overview',exact:true}).waitFor();
  assert.equal(await player.getByRole('heading',{name:'Telemetry history'}).count(),0);
  assert.equal(await player.getByRole('button',{name:/Save policy|Clear history|Manage player access/}).count(),0);
  await player.locator('#invite-code').fill(code);
  await player.getByRole('button',{name:'Redeem invitation'}).click();
  await player.getByText('This invitation is invalid or unavailable.').waitFor();

  await owner.getByRole('button',{name:'Manage player access'}).click();
  const row=owner.locator('.invite-entry').filter({hasText:recipient});
  await row.getByLabel('Overview').uncheck();
  await row.getByLabel('Telemetry history').check();
  await row.getByLabel('Online player count').check();
  await row.getByRole('button',{name:'Save access'}).click();
  await owner.getByText('Access updated.').waitFor();
  await player.reload();
  await player.getByRole('heading',{name:'Telemetry history'}).waitFor();
  await player.getByRole('heading',{name:'Online players'}).waitFor();
  await player.getByText('2',{exact:true}).waitFor();
  assert.equal(await player.getByRole('heading',{name:'Overview',exact:true}).count(),0);
  await row.getByRole('button',{name:'Revoke'}).click();
  await owner.getByText('Access revoked.').waitFor();
  await player.reload();
  await player.getByText('No shared servers.',{exact:false}).waitFor();
  assert.deepEqual(unexpected,[]);
  console.log('Invitations passed: issue, redeem once, scoped read, update, and revoke.');
} finally { await browser.close(); }
