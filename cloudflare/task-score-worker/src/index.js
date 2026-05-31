const ALLOWED_ORIGINS = new Set([
  'https://jenffry90-arch.github.io',
  'https://sapho-workspace-dashboard.netlify.app',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

const LEISURE_METRICS = new Set([
  'enjoyment',
  'restoration',
  'excitement',
  'social',
  'money',
  'risk',
  'novelty',
  'logistics',
  'meaning',
  'physical_health',
]);

const LEISURE_WEIGHTS = {
  enjoyment: { weight: 14, kind: 'benefit' },
  restoration: { weight: 13, kind: 'benefit' },
  excitement: { weight: 13, kind: 'benefit' },
  social: { weight: 10, kind: 'benefit' },
  money: { weight: 8, kind: 'friction' },
  risk: { weight: 7, kind: 'friction' },
  novelty: { weight: 8, kind: 'benefit' },
  logistics: { weight: 6, kind: 'friction' },
  meaning: { weight: 13, kind: 'benefit' },
  physical_health: { weight: 8, kind: 'benefit' },
};

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function corsHeaders(origin) {
  const headers = new Headers(DEFAULT_HEADERS);
  if (origin && (ALLOWED_ORIGINS.has(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Sapho-Task-Score-Token');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

function json(payload, status = 200, origin = '') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(origin),
  });
}

function requireToken(request, env) {
  const token = env.SAPHO_TASK_SCORE_TOKEN || '';
  if (!token) return true;
  return request.headers.get('X-Sapho-Task-Score-Token') === token;
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

function scoreLeisure(scores) {
  const clean = {};
  for (const metric of LEISURE_METRICS) {
    const raw = Number(scores?.[metric]);
    if (!Number.isFinite(raw) || raw < 1 || raw > 5) {
      throw new Error(`${metric} score must be between 1 and 5`);
    }
    clean[metric] = raw;
  }
  let total = 0;
  for (const [metric, spec] of Object.entries(LEISURE_WEIGHTS)) {
    const value = Number(clean[metric]);
    const normalized = spec.kind === 'friction' ? (5 - value) / 4 : (value - 1) / 4;
    total += spec.weight * normalized;
  }
  return {
    scores: clean,
    overall: Math.max(0, Math.min(100, Math.round(total))),
  };
}

async function listTaskScores(env) {
  const { results } = await env.DB.prepare(
    'select task_id, score, title, project, updated_at from task_scores order by updated_at desc'
  ).all();
  return results || [];
}

async function getTaskScore(env, taskId) {
  return env.DB.prepare(
    'select task_id, score, title, project, updated_at from task_scores where task_id = ?'
  ).bind(taskId).first();
}

async function upsertTaskScore(env, taskId, payload) {
  const score = Number(payload?.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error('score must be between 1 and 5');
  }
  const title = String(payload?.title || '').slice(0, 500);
  const project = String(payload?.project || '').slice(0, 200);
  const updated_at = isoNow();
  await env.DB.prepare(
    `insert into task_scores(task_id, score, title, project, updated_at)
     values(?, ?, ?, ?, ?)
     on conflict(task_id) do update set
       score = excluded.score,
       title = excluded.title,
       project = excluded.project,
       updated_at = excluded.updated_at`
  ).bind(taskId, score, title, project, updated_at).run();
  return getTaskScore(env, taskId);
}

async function listLeisureScores(env) {
  const { results } = await env.DB.prepare(
    'select item_id, scores_json, overall, title, source, updated_at from leisure_scores order by updated_at desc'
  ).all();
  return (results || []).map(row => ({
    item_id: row.item_id,
    scores: JSON.parse(row.scores_json),
    overall: Number(row.overall),
    title: row.title,
    source: row.source,
    updated_at: row.updated_at,
  }));
}

async function getLeisureScore(env, itemId) {
  const row = await env.DB.prepare(
    'select item_id, scores_json, overall, title, source, updated_at from leisure_scores where item_id = ?'
  ).bind(itemId).first();
  if (!row) return null;
  return {
    item_id: row.item_id,
    scores: JSON.parse(row.scores_json),
    overall: Number(row.overall),
    title: row.title,
    source: row.source,
    updated_at: row.updated_at,
  };
}

async function upsertLeisureScore(env, itemId, payload) {
  const result = scoreLeisure(payload?.scores);
  const title = String(payload?.title || '').slice(0, 500);
  const source = String(payload?.source || '').slice(0, 200);
  const updated_at = isoNow();
  await env.DB.prepare(
    `insert into leisure_scores(item_id, scores_json, overall, title, source, updated_at)
     values(?, ?, ?, ?, ?, ?)
     on conflict(item_id) do update set
       scores_json = excluded.scores_json,
       overall = excluded.overall,
       title = excluded.title,
       source = excluded.source,
       updated_at = excluded.updated_at`
  ).bind(itemId, JSON.stringify(result.scores), result.overall, title, source, updated_at).run();
  return getLeisureScore(env, itemId);
}

async function getHedonicState(env) {
  const row = await env.DB.prepare(
    'select state_json, updated_at from hedonic_state where id = ?'
  ).bind('current').first();
  if (!row) return null;
  return JSON.parse(row.state_json);
}

async function upsertHedonicState(env, payload) {
  const title = String(payload?.title || '').slice(0, 500);
  const description = String(payload?.description || '').slice(0, 4000);
  const result = scoreLeisure(payload?.scores);
  const recommendation = String(payload?.recommendation || '').slice(0, 500);
  const updated_at = isoNow();
  const state = {
    title,
    description,
    scores: result.scores,
    overall: result.overall,
    recommendation,
    updated_at,
  };
  await env.DB.prepare(
    `insert into hedonic_state(id, state_json, updated_at)
     values(?, ?, ?)
     on conflict(id) do update set
       state_json = excluded.state_json,
       updated_at = excluded.updated_at`
  ).bind('current', JSON.stringify(state), updated_at).run();
  return state;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'sapho-task-score-api', updated_at: isoNow() }, 200, origin);
    }

    if (url.pathname === '/api/task-scores' && request.method === 'GET') {
      return json({ scores: await listTaskScores(env) }, 200, origin);
    }
    if (url.pathname.startsWith('/api/task-scores/') && request.method === 'GET') {
      const taskId = decodeURIComponent(url.pathname.slice('/api/task-scores/'.length));
      const row = await getTaskScore(env, taskId);
      if (!row) return json({ error: 'not found' }, 404, origin);
      return json(row, 200, origin);
    }
    if (url.pathname.startsWith('/api/task-scores/') && request.method === 'POST') {
      if (!requireToken(request, env)) return json({ error: 'unauthorized' }, 401, origin);
      const taskId = decodeURIComponent(url.pathname.slice('/api/task-scores/'.length));
      try {
        const payload = await readJson(request);
        return json(await upsertTaskScore(env, taskId, payload), 200, origin);
      } catch (err) {
        return json({ error: err.message || 'invalid request' }, 400, origin);
      }
    }

    if (url.pathname === '/api/leisure-scores' && request.method === 'GET') {
      return json({ scores: await listLeisureScores(env) }, 200, origin);
    }
    if (url.pathname.startsWith('/api/leisure-scores/') && request.method === 'GET') {
      const itemId = decodeURIComponent(url.pathname.slice('/api/leisure-scores/'.length));
      const row = await getLeisureScore(env, itemId);
      if (!row) return json({ error: 'not found' }, 404, origin);
      return json(row, 200, origin);
    }
    if (url.pathname.startsWith('/api/leisure-scores/') && request.method === 'POST') {
      if (!requireToken(request, env)) return json({ error: 'unauthorized' }, 401, origin);
      const itemId = decodeURIComponent(url.pathname.slice('/api/leisure-scores/'.length));
      try {
        const payload = await readJson(request);
        return json(await upsertLeisureScore(env, itemId, payload), 200, origin);
      } catch (err) {
        return json({ error: err.message || 'invalid request' }, 400, origin);
      }
    }

    if (url.pathname === '/api/hedonic-state' && request.method === 'GET') {
      return json({ state: await getHedonicState(env) }, 200, origin);
    }
    if (url.pathname === '/api/hedonic-state' && request.method === 'POST') {
      if (!requireToken(request, env)) return json({ error: 'unauthorized' }, 401, origin);
      try {
        const payload = await readJson(request);
        return json({ state: await upsertHedonicState(env, payload) }, 200, origin);
      } catch (err) {
        return json({ error: err.message || 'invalid request' }, 400, origin);
      }
    }

    return json({ error: 'not found' }, 404, origin);
  },
};
