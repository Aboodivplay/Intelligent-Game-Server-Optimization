import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Database admin credentials are injected by Supabase, never sent to GitHub.
const projectUrl = Deno.env.get('SUPABASE_URL')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(projectUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigin = 'https://aboodivplay.github.io';
const serverFields = 'id,name,threshold,manual_override,last_seen,tracking_enabled,console_enabled';

function reply(data: unknown, status = 200, origin = '') {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Pragma': 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
    ...(origin === allowedOrigin ? {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    } : {}),
  } });
}

function reject(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) reject('JSON is required.', 415);
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 131072) { await reader.cancel(); reject('Request too large.', 413); }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) reject('Invalid JSON.');
    return parsed;
  } catch { reject('Invalid JSON.'); }
}

async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function newKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function checked(result: { error: unknown; data: any }) {
  if (result.error) reject('The request could not be completed.', 500);
  return result.data;
}

function presentServer(server: any) {
  return {
    id: server.id, name: server.name, threshold: server.threshold,
    manualOverride: server.manual_override, trackingEnabled: server.tracking_enabled, consoleEnabled: server.console_enabled, lastSeen: server.last_seen,
    online: !!server.last_seen && Date.now() - Date.parse(server.last_seen) < 30000,
  };
}

async function recordAudit(owner: string, action: string, detail: string) {
  checked(await admin.from('igso_audit').insert({ owner_id: owner, action, detail }));
}

function validateSample(sample: any) {
  for (const [key, maximum] of Object.entries({ cpu: 100, memory: 100, tps: 20, entities: 10000000, players: 1000000 })) {
    if (!Number.isFinite(sample[key]) || sample[key] < 0 || sample[key] > maximum) reject('Invalid telemetry.');
  }
  if (!Number.isInteger(sample.entities) || !Number.isInteger(sample.players)) reject('Invalid entity or player count.');
  for (const key of ['memoryUsedMb', 'memoryMaxMb']) if (sample[key] !== undefined && (!Number.isFinite(sample[key]) || sample[key] < 0 || sample[key] > 1000000000)) reject('Invalid memory reading.');
  if (sample.platform !== undefined && (typeof sample.platform !== 'string' || sample.platform.length > 120)) reject('Invalid platform.');
}

Deno.serve(async request => {
  const origin = request.headers.get('origin') || '';
  try {
    if (origin && origin !== allowedOrigin) reject('Origin not allowed.', 403);
    if (request.method === 'OPTIONS') return reply({}, 200, origin);
    const path = new URL(request.url).pathname.split('/igso-api')[1] || '/';
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
    if (path === '/telemetry' && request.method === 'POST') {
      // A distinct server key permits ingestion only, never dashboard access.
      if (!/^[a-f0-9]{64}$/.test(token)) reject('Invalid agent credentials.', 401);
      const sample = await body(request);
      const server = checked(await admin.from('igso_servers').select('id,last_seen').eq('id', String(sample.serverId || '')).eq('agent_key_hash', await hash(token)).maybeSingle());
      if (!server) reject('Invalid agent credentials.', 401);
      if (server.last_seen && Date.now() - Date.parse(server.last_seen) < 2000) reject('Sample received too quickly.', 429);
      validateSample(sample);
      const playerStates = [];
      if (sample.trackingEnabled === true && Array.isArray(sample.playerStates)) {
        if (sample.playerStates.length > 200) reject('Player snapshot exceeds 200 players.');
        for (const player of sample.playerStates) {
          if (!player || typeof player.name !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(player.name) || typeof player.uuid !== 'string' || !/^[a-f0-9-]{36}$/.test(player.uuid) || typeof player.world !== 'string' || player.world.length > 100) reject('Invalid player snapshot.');
          if (![player.x,player.y,player.z].every(n => Number.isFinite(n) && Math.abs(n) <= 32000000) || !['AFK','Moving','Fighting','Idle'].includes(player.activity)) reject('Invalid player position.');
          playerStates.push({uuid:player.uuid,name:player.name,world:player.world,x:player.x,y:player.y,z:player.z,activity:player.activity});
        }
      }
      const timestamp = new Date().toISOString();
      const payload = { timestamp, cpu: sample.cpu, memory: sample.memory, tps: sample.tps, entities: sample.entities, players: sample.players, memoryUsedMb: sample.memoryUsedMb, memoryMaxMb: sample.memoryMaxMb, platform: sample.platform || 'Paper' };
      checked(await admin.from('igso_telemetry').insert({ server_id: server.id, recorded_at: timestamp, payload }));
      checked(await admin.from('igso_servers').update({ last_seen: timestamp, player_snapshot: playerStates, tracking_enabled: sample.trackingEnabled === true, console_enabled: sample.consoleEnabled === true }).eq('id', server.id));
      // Acknowledgements belong only to this authenticated agent and server.
      for (const result of Array.isArray(sample.commandResults) ? sample.commandResults.slice(0,10) : []) {
        if (!/^[a-f0-9-]{36}$/.test(result.id || '') || !['completed','rejected'].includes(result.status) || typeof result.output !== 'string') continue;
        checked(await admin.from('igso_commands').update({status: result.status, output: result.output.slice(0,4000)}).eq('id',result.id).eq('server_id',server.id).eq('status','sent'));
      }
      const commands = [];
      if (sample.consoleEnabled === true) {
        const pending = checked(await admin.from('igso_commands').select('id,command').eq('server_id',server.id).eq('status','queued').gt('expires_at',timestamp).order('created_at').limit(3));
        for (const command of pending) {
          // Compare-and-set claims once. Lost deliveries are never silently replayed.
          const claimed = checked(await admin.from('igso_commands').update({status:'sent'}).eq('id',command.id).eq('status','queued').gt('expires_at',timestamp).select('id,command'));
          commands.push(...claimed);
        }
      }
      return reply({ received: true, commands }, 201, origin);
    }
    // Verify JWTs with Auth, rather than trusting a decoded client-side claim.
    const userClient = createClient(projectUrl, publicKey, {
      global: { headers: { Authorization: 'Bearer ' + token } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await userClient.auth.getUser(token);
    if (identity.error || !identity.data.user) reject('Please log in to continue.', 401);
    // Agent traffic has its own key. Every account route below requires a current workspace session.
    const gate = await userClient.rpc('igso_workspace_session_ready');
    if (gate.error) reject('Could not verify session security.', 503);
    if (gate.data !== true) {
      return reply({ code: 'mfa_required', error: 'Sign in again and complete account verification.' }, 403, origin);
    }
    const userId = identity.data.user.id;
    if (path === '/audit/clear' && request.method === 'POST') {
      const { throughId } = await body(request);
      if (typeof throughId !== 'string' || !/^[1-9]\d{0,18}$/.test(throughId) || BigInt(throughId) > 9223372036854775807n) {
        reject('Choose a valid audit entry.');
      }
      // Clear only through the last entry the user saw. Later actions stay visible.
      const saved = checked(await admin.rpc('igso_clear_audit_view', { target_owner: userId, last_entry: throughId }));
      if (!saved) reject('The audit history changed. Refresh the workspace and try again.', 409);
      return reply({ throughId }, 200, origin);
    }
    if (path === '/servers' && request.method === 'POST') {
      const input = await body(request);
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length < 2 || name.length > 60) reject('Use a name between 2 and 60 characters.');
      const existing = await userClient.from('igso_servers').select('id', { count: 'exact', head: true });
      if (existing.error) reject('Could not verify server limit.', 500);
      if ((existing.count || 0) >= 10) reject('Limit of ten server connections reached.');
      const key = newKey();
      const server = checked(await admin.from('igso_servers').insert({ owner_id: userId, name, agent_key_hash: await hash(key) }).select(serverFields).single());
      await recordAudit(userId, 'Server registered', name);
      return reply({ server: presentServer(server), agentKey: key }, 201, origin);
    }
    const trainingRoute = path.match(/^\/servers\/([a-f0-9-]{36})\/(incidents|training)$/);
    if (trainingRoute) {
      const server = checked(await userClient.from('igso_servers').select('id,name').eq('id',trainingRoute[1]).maybeSingle());
      if (!server) reject('Server not found.',404);
      if (trainingRoute[2] === 'incidents' && request.method === 'POST') {
        const input = await body(request), time = Date.parse(input.occurredAt);
        if (!['crash','severe_lag'].includes(input.kind) || !Number.isFinite(time) || time > Date.now() || time < Date.now()-30*86400000) reject('Choose a real incident time within the last 30 days.');
        checked(await admin.from('igso_incidents').insert({server_id:server.id,kind:input.kind,occurred_at:new Date(time).toISOString()}));
        await recordAudit(userId,'Incident labeled',server.name + ': ' + input.kind);
        return reply({saved:true},201,origin);
      }
      if (trainingRoute[2] === 'training' && request.method === 'GET') {
        const rows=[];
        // Paginate because PostgREST caps each response at 1,000 rows.
        for (let offset=0; offset<10000; offset+=1000) {
          const page=checked(await userClient.from('igso_telemetry').select('payload').eq('server_id',server.id).order('recorded_at',{ascending:false}).range(offset,offset+999));
          rows.push(...page); if(page.length<1000)break;
        }
        const events=checked(await userClient.from('igso_incidents').select('occurred_at,kind').eq('server_id',server.id).order('occurred_at').limit(1000));
        return reply({schemaVersion:1,serverId:server.id,samples:rows.reverse().map((row:any)=>row.payload),incidents:events,coverageWarning:'Latest 10000 samples only. Unlabeled intervals are not proof of healthy operation.'},200,origin);
      }
      reject('Method not allowed.',405);
    }
    const commandRoute = path.match(/^\/servers\/([a-f0-9-]{36})\/commands$/);
    if (commandRoute && request.method === 'POST') {
      const server = checked(await userClient.from('igso_servers').select(serverFields).eq('id',commandRoute[1]).maybeSingle());
      if (!server) reject('Server not found.',404);
      if (!presentServer(server).online || !server.console_enabled) reject('The agent must be online with remote console enabled.',409);
      const input = await body(request);
      const command = typeof input.command === 'string' ? input.command.trim().replace(/^\//,'') : '';
      if (!command || command.length > 256 || /[\r\n\x00-\x1f\x7f]/.test(command)) reject('Use one command, up to 256 characters.');
      const recent = checked(await admin.from('igso_commands').select('id').eq('server_id',server.id).gt('created_at',new Date(Date.now()-5000).toISOString()).limit(1));
      if (recent.length) reject('Wait five seconds between commands.',429);
      const created = checked(await admin.from('igso_commands').insert({server_id:server.id,command}).select('id').single());
      await recordAudit(userId,'Console command queued',server.name + ': ' + command.split(' ')[0]);
      return reply({id:created.id,queued:true},202,origin);
    }
    const match = path.match(/^\/servers\/([a-f0-9-]{36})(\/key)?$/);
    if (match && ['PATCH', 'POST', 'DELETE'].includes(request.method)) {
      // This lookup is constrained by both the JWT and database RLS.
      const server = checked(await userClient.from('igso_servers').select(serverFields).eq('id', match[1]).maybeSingle());
      if (!server) reject('Server not found.', 404);
      if (!match[2] && request.method === 'DELETE') {
        const input = await body(request);
        if (input.confirmName !== server.name) reject('Type the exact server name to confirm deletion.');
        checked(await admin.from('igso_servers').delete().eq('id',server.id).eq('owner_id',userId));
        await recordAudit(userId,'Server deleted',server.name);
        return reply({deleted:true},200,origin);
      }
      if (match[2] && request.method === 'POST') {
        const key = newKey();
        checked(await admin.from('igso_servers').update({ agent_key_hash: await hash(key), last_seen: null }).eq('id', server.id).eq('owner_id', userId));
        await recordAudit(userId, 'Agent key rotated', server.name);
        return reply({ server: presentServer({ ...server, last_seen: null }), agentKey: key }, 200, origin);
      }
      if (match[2] || request.method !== 'PATCH') reject('Method not allowed.', 405);
      const input = await body(request);
      const name = input.name === undefined ? server.name : input.name;
      const threshold = input.threshold === undefined ? server.threshold : input.threshold;
      const override = input.manualOverride === undefined ? server.manual_override : input.manualOverride;
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60 || !Number.isInteger(threshold) || threshold < 50 || threshold > 99 || typeof override !== 'boolean') reject('Invalid server policy.');
      checked(await userClient.from('igso_servers').update({ name: name.trim(), threshold, manual_override: override }).eq('id', server.id));
      await recordAudit(userId, 'Policy updated', name.trim());
      return reply({ saved: true }, 200, origin);
    }
    if (path === '/dashboard' && request.method === 'GET') {
      const servers = checked(await userClient.from('igso_servers').select(serverFields).order('created_at'));
      const id = new URL(request.url).searchParams.get('server') || servers[0]?.id;
      if (id && !servers.some((server: any) => server.id === id)) reject('Server not found.', 404);
      const oldest = new Date(Date.now() - 30 * 86400000).toISOString();
      const rows = id ? checked(await userClient.from('igso_telemetry').select('payload').eq('server_id', id).gte('recorded_at', oldest).order('recorded_at', { ascending: false }).limit(300)) : [];
      const liveServer = servers.find((server:any) => server.id === id);
      const snapshot = id && presentServer(liveServer).online ? checked(await userClient.from('igso_servers').select('player_snapshot').eq('id',id).single()).player_snapshot : [];
      const commands = id ? checked(await userClient.from('igso_commands').select('id,created_at,expires_at,status,command,output').eq('server_id',id).order('created_at',{ascending:false}).limit(30)) : [];
      const auditStart = new Date(Date.now() - 90 * 86400000).toISOString();
      const [logResult, viewResult] = await Promise.all([
        userClient.from('igso_audit').select('id::text,recorded_at,action,detail')
          .eq('owner_id', userId).gte('recorded_at', auditStart).order('id', { ascending: false }).limit(100),
        admin.from('igso_audit_views').select('through_id::text').eq('owner_id', userId).maybeSingle(),
      ]);
      const throughId = BigInt(checked(viewResult)?.through_id || 0);
      const audit = checked(logResult).map((row: any) => ({
        id: row.id, timestamp: row.recorded_at, action: row.action, detail: row.detail,
        cleared: BigInt(row.id) <= throughId,
      }));
      return reply({ playerStates: snapshot, commands, servers: servers.map(presentServer), telemetry: rows.reverse().map((row: any) => row.payload), audit }, 200, origin);
    }
    reject('Endpoint not found.', 404);
  } catch (error) {
    // Never log passwords, tokens, payloads, SQL errors or email addresses.
    const status = error instanceof Error && 'status' in error ? Number(error.status) : 500;
    return reply({ error: status < 500 && error instanceof Error ? error.message : 'The service could not complete this request.' }, status, origin);
  }
});

