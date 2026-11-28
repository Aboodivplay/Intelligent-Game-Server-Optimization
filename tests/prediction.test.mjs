import assert from 'node:assert/strict';
import test from 'node:test';
import { predictServerRisk } from '../supabase/functions/igso-api/prediction.js';

const now = Date.UTC(2026,10,28,12);
const server = { loader:'Forge', minecraftVersion:'1.20.1', online:true, threshold:80 };
function windowRows(level, interval = 5) {
  return Array.from({length: 1 + Math.floor(295 / interval)}, (_, index) => {
    const i = index * interval / 5;
    return { timestamp:new Date(now-295000+i*5000).toISOString(), platform:'Forge', minecraftVersion:'1.20.1',
      intervalSeconds:interval, cpu:32+i*.1+level*47, memory:47+i*.12+level*28, tps:19.9-level*.09*i,
      mspt:19+.12*i+level*.8*i, entities:460+i*2+level*i*12, players:8+Math.floor(i)%5+level*11 };
  });
}

test('the deployed LSTM agrees with Python on two different sequences', () => {
  for (const [level, expected] of [[0,.024129505883606954],[1,.543776487453336]]) {
    const result = predictServerRisk(windowRows(level), server, now);
    assert.equal(result.state,'ready');
    assert.ok(Math.abs(result.score-expected) < 0.00001);
    assert.equal(result.horizonMinutes,5);
  }
  const fast = predictServerRisk(windowRows(1,1),{...server, threshold:50},now);
  assert.ok(fast.elevated && Math.abs(fast.score-.543776487453336) < 0.00001);
});

test('gaps, missing sensors and server changes start a new observation window', () => {
  const rows=windowRows(0);
  assert.equal(predictServerRisk(rows.slice(1),server,now).available,59);
  assert.equal(predictServerRisk(rows.filter((_,i)=>i!==35),server,now).available,24);
  assert.equal(predictServerRisk([...rows.slice(0,-1),{...rows.at(-1),cpu:null}],server,now).available,0);
  assert.equal(predictServerRisk(rows,{...server,loader:'Fabric'},now).state,'version_mismatch');
  assert.equal(predictServerRisk(rows,server,now+15000).state,'offline');
  assert.equal(predictServerRisk(rows,{...server,online:false},now).state,'offline');
  const switched=rows.map((r,i)=>i<30?{...r,platform:'Fabric'}:r);
  assert.equal(predictServerRisk(switched,server,now).available,30);
});
