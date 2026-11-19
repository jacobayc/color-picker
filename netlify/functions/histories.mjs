import { randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'rig-code-histories';
const INDEX_KEY = '_index';
const MAX_ITEMS = 1000;
const MAX_CODE_CHARS = 512 * 1024;
const MAX_THUMB_BYTES = 200 * 1024;
const MAX_IMPORT_BATCH = 50;
const ID_REGEX = /^[a-zA-Z0-9_-]{3,80}$/;

export const config = {
  path: ['/api/histories', '/api/histories/*'],
};

/**
 * Normalize code text and compute a deterministic dual FNV-1a + length hash.
 * Must stay identical to computeCodeHash() in 3d/index.html.
 */
export function computeCodeHash(rawCode) {
  const str = String(rawCode || '').replace(/\r\n/g, '\n').trim();
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (c + i) & 0xffff;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}_${str.length}`;
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    ...extra,
  };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    }),
  });
}

function codeKey(id) {
  return `code/${id}`;
}

function thumbKey(id) {
  return `thumb/${id}`;
}

function isValidId(id) {
  return typeof id === 'string' && id !== 'import' && ID_REGEX.test(id);
}

function verifyAdminKey(req, adminKey) {
  if (!adminKey) return true;
  const provided = req.headers.get('x-admin-key') || '';
  const expectedBuf = Buffer.from(adminKey, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

function decodeJpegDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const header = dataUrl.slice(0, commaIdx);
  if (!header.includes(';base64')) return null;
  const buf = Buffer.from(dataUrl.slice(commaIdx + 1), 'base64');
  if (buf.byteLength < 1 || buf.byteLength > MAX_THUMB_BYTES) return null;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function normalizeMetaFields(raw, fallbackTime) {
  const created = Number(raw.createdAt);
  const updated = Number(raw.updatedAt);
  const trisNum = Number(raw.tris);
  return {
    title: String(raw.title || '').trim().slice(0, 160) || '3D Model Snippet',
    fnName: String(raw.fnName || raw.functionName || 'snippet').trim().slice(0, 100) || 'snippet',
    sizeText: String(raw.sizeText || '').trim().slice(0, 60),
    tris: Number.isFinite(trisNum) ? Math.max(0, Math.round(trisNum)) : 0,
    createdAt: Number.isFinite(created) && created > 0 ? created : fallbackTime,
    updatedAt: Number.isFinite(updated) && updated > 0 ? updated : fallbackTime,
  };
}

async function readIndex(store) {
  const raw = await store.get(INDEX_KEY, { type: 'json' });
  return Array.isArray(raw) ? raw : [];
}

async function cleanupItems(store, items) {
  if (!items.length) return;
  await Promise.allSettled(
    items.flatMap((it) => [store.delete(codeKey(it.id)), store.delete(thumbKey(it.id))])
  );
}

async function handleList(store, adminKey) {
  const items = await readIndex(store);
  return jsonResponse(
    {
      items,
      authRequired: Boolean(adminKey),
      maxItems: MAX_ITEMS,
    },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

async function handleGetItem(store, id, url) {
  const data = await store.get(codeKey(id), { type: 'json' });
  if (!data) {
    return jsonResponse({ error: 'History item not found' }, 404, { 'Cache-Control': 'no-store' });
  }
  const cacheHeaders = url.searchParams.has('v')
    ? {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
      }
    : { 'Cache-Control': 'no-cache' };
  return jsonResponse(data, 200, cacheHeaders);
}

async function handleGetThumb(store, id) {
  const buf = await store.get(thumbKey(id), { type: 'arrayBuffer' });
  if (!buf) {
    return jsonResponse({ error: 'Thumbnail not found' }, 404, { 'Cache-Control': 'no-store' });
  }
  return new Response(buf, {
    status: 200,
    headers: corsHeaders({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable',
    }),
  });
}

async function handleSaveSingle(req, store) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const code = typeof body?.code === 'string' ? body.code : '';
  if (!code.trim() || code.length > MAX_CODE_CHARS) {
    return jsonResponse({ error: 'Code is empty or exceeds maximum length' }, 400);
  }

  const now = Date.now();
  const codeHash = computeCodeHash(code);
  const fields = normalizeMetaFields(body, now);
  const thumbBuffer = decodeJpegDataUrl(body.thumbnail);
  const index = await readIndex(store);

  const existingIdx = index.findIndex((it) => it && it.codeHash === codeHash);
  if (existingIdx >= 0) {
    const existing = index[existingIdx];
    const id = existing.id;
    const hasThumb = Boolean(thumbBuffer) || Boolean(existing.hasThumb);
    const meta = {
      id,
      title: fields.title,
      fnName: fields.fnName,
      sizeText: fields.sizeText,
      tris: fields.tris,
      hasThumb,
      codeHash,
      createdAt: existing.createdAt || fields.createdAt,
      updatedAt: now,
    };

    const writes = [store.setJSON(codeKey(id), { ...meta, code })];
    if (thumbBuffer) writes.push(store.set(thumbKey(id), thumbBuffer));
    await Promise.all(writes);

    index.splice(existingIdx, 1);
    index.unshift(meta);
    await store.setJSON(INDEX_KEY, index);

    return jsonResponse({ item: meta, deduped: true, total: index.length }, 200);
  }

  const requestedId = isValidId(body.id) && !index.some((it) => it?.id === body.id)
    ? body.id
    : `rig_${now}_${randomBytes(3).toString('hex')}`;

  const meta = {
    id: requestedId,
    title: fields.title,
    fnName: fields.fnName,
    sizeText: fields.sizeText,
    tris: fields.tris,
    hasThumb: Boolean(thumbBuffer),
    codeHash,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };

  const writes = [store.setJSON(codeKey(requestedId), { ...meta, code })];
  if (thumbBuffer) writes.push(store.set(thumbKey(requestedId), thumbBuffer));
  await Promise.all(writes);

  index.unshift(meta);
  const overflow = index.length > MAX_ITEMS ? index.splice(MAX_ITEMS) : [];
  await store.setJSON(INDEX_KEY, index);
  await cleanupItems(store, overflow);

  return jsonResponse({ item: meta, deduped: false, total: index.length }, 201);
}

async function handleImportBatch(req, store) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const rawItems = body?.items;
  if (!Array.isArray(rawItems) || rawItems.length > MAX_IMPORT_BATCH) {
    return jsonResponse({ error: `items must be an array of at most ${MAX_IMPORT_BATCH}` }, 400);
  }

  const index = await readIndex(store);
  const existingHashes = new Set(index.map((it) => it?.codeHash).filter(Boolean));
  const existingIds = new Set(index.map((it) => it?.id).filter(Boolean));

  const toWrite = [];
  let skipped = 0;
  const now = Date.now();

  for (const raw of rawItems) {
    const code = typeof raw?.code === 'string' ? raw.code : '';
    if (!code.trim() || code.length > MAX_CODE_CHARS) {
      skipped++;
      continue;
    }
    const codeHash = computeCodeHash(code);
    if (existingHashes.has(codeHash)) {
      skipped++;
      continue;
    }

    let id = isValidId(raw.id) && !existingIds.has(raw.id)
      ? raw.id
      : `rig_${now}_${randomBytes(3).toString('hex')}`;
    while (existingIds.has(id)) {
      id = `rig_${now}_${randomBytes(3).toString('hex')}`;
    }

    const fields = normalizeMetaFields(raw, now);
    const thumbBuffer = decodeJpegDataUrl(raw.thumbnail);
    const meta = {
      id,
      title: fields.title,
      fnName: fields.fnName,
      sizeText: fields.sizeText,
      tris: fields.tris,
      hasThumb: Boolean(thumbBuffer),
      codeHash,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
    };

    existingHashes.add(codeHash);
    existingIds.add(id);
    toWrite.push({ meta, code, thumbBuffer });
  }

  for (let i = 0; i < toWrite.length; i += 5) {
    const chunk = toWrite.slice(i, i + 5);
    await Promise.all(
      chunk.flatMap(({ meta, code, thumbBuffer }) => {
        const ops = [store.setJSON(codeKey(meta.id), { ...meta, code })];
        if (thumbBuffer) ops.push(store.set(thumbKey(meta.id), thumbBuffer));
        return ops;
      })
    );
  }

  if (toWrite.length > 0) {
    index.push(...toWrite.map((entry) => entry.meta));
    index.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const overflow = index.length > MAX_ITEMS ? index.splice(MAX_ITEMS) : [];
    await store.setJSON(INDEX_KEY, index);
    await cleanupItems(store, overflow);
  }

  return jsonResponse({
    imported: toWrite.length,
    skipped,
    total: index.length,
    items: index,
  });
}

async function handleDeleteItem(store, id) {
  const index = await readIndex(store);
  const targetIdx = index.findIndex((it) => it && it.id === id);
  if (targetIdx < 0) {
    return jsonResponse({ error: 'History item not found' }, 404);
  }

  index.splice(targetIdx, 1);
  await Promise.allSettled([
    store.delete(codeKey(id)),
    store.delete(thumbKey(id)),
    store.setJSON(INDEX_KEY, index),
  ]);

  return jsonResponse({ deleted: id, total: index.length });
}

/**
 * Route and execute /api/histories requests against a Blob store instance.
 */
export async function handleHistoriesRequest(req, store, adminKey = '') {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  let subPath;
  if (pathname === '/api/histories') {
    subPath = '';
  } else if (pathname.startsWith('/api/histories/')) {
    subPath = pathname.slice('/api/histories/'.length);
  } else {
    return jsonResponse({ error: 'Not Found' }, 404);
  }

  let segments = [];
  if (subPath) {
    try {
      segments = subPath.split('/').map((s) => decodeURIComponent(s));
    } catch {
      return jsonResponse({ error: 'Malformed path' }, 400);
    }
  }

  try {
    if (req.method === 'GET') {
      if (segments.length === 0) return await handleList(store, adminKey);
      if (segments.length === 1 && isValidId(segments[0])) {
        return await handleGetItem(store, segments[0], url);
      }
      if (segments.length === 2 && segments[1] === 'thumb' && isValidId(segments[0])) {
        return await handleGetThumb(store, segments[0]);
      }
      if (segments.length === 1 || segments.length === 2) {
        return jsonResponse({ error: 'Invalid history ID' }, 400);
      }
      return jsonResponse({ error: 'Not Found' }, 404);
    }

    if (req.method === 'POST' || req.method === 'DELETE') {
      if (!verifyAdminKey(req, adminKey)) {
        return jsonResponse({ error: 'Invalid or missing x-admin-key' }, 401);
      }
      if (req.method === 'POST') {
        if (segments.length === 0) return await handleSaveSingle(req, store);
        if (segments.length === 1 && segments[0] === 'import') {
          return await handleImportBatch(req, store);
        }
        return jsonResponse({ error: 'Not Found' }, 404);
      }
      if (segments.length === 1 && isValidId(segments[0])) {
        return await handleDeleteItem(store, segments[0]);
      }
      return jsonResponse({ error: 'Invalid history ID' }, 400);
    }

    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Internal Server Error' }, 500);
  }
}

export default async function handler(req, _context) {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  const adminKey = process.env.HISTORY_ADMIN_KEY || '';
  return handleHistoriesRequest(req, store, adminKey);
}
