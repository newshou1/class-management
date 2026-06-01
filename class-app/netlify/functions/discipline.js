import { getStore } from '@netlify/blobs';

function getUserId(req) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.substring(7);
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return payload.sub;
  } catch {
    return null;
  }
}

export default async (req, context) => {
  const userId = getUserId(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: '请先登录' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const store = getStore('discipline');

  if (req.method === 'GET') {
    const json = await store.get(`records:${userId}`, { type: 'text' });
    const records = json ? JSON.parse(json) : [];
    return new Response(JSON.stringify(records), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { studentName, disciplineTime, disciplineContent, photos, createdBy } = body;

    if (!studentName || !disciplineTime || !disciplineContent) {
      return new Response(JSON.stringify({ error: '请填写完整信息' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const record = {
      id: crypto.randomUUID(),
      studentName,
      disciplineTime,
      disciplineContent,
      photos: photos || [],
      createdBy: createdBy || '',
      createdAt: new Date().toISOString()
    };

    const json = await store.get(`records:${userId}`, { type: 'text' });
    const records = json ? JSON.parse(json) : [];
    records.unshift(record);
    await store.set(`records:${userId}`, JSON.stringify(records));

    return new Response(JSON.stringify({ success: true, record }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'DELETE') {
    const body = await req.json();
    const { recordId } = body;

    if (!recordId) {
      return new Response(JSON.stringify({ error: '缺少记录ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const json = await store.get(`records:${userId}`, { type: 'text' });
    const records = json ? JSON.parse(json) : [];
    const updated = records.filter(r => r.id !== recordId);
    await store.set(`records:${userId}`, JSON.stringify(updated));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = {
  path: '/api/discipline'
};
