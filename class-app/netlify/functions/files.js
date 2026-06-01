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

  const metaStore = getStore('file-meta');
  const dataStore = getStore('file-data');

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const tabIndex = url.searchParams.get('tabIndex');

    // 下载单个文件
    if (fileId && tabIndex !== null) {
      const metaJson = await metaStore.get(`meta:${userId}:tab${tabIndex}`, { type: 'text' });
      if (!metaJson) {
        return new Response(JSON.stringify({ error: '文件不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const metas = JSON.parse(metaJson);
      const meta = metas.find(f => f.id === fileId);
      if (!meta) {
        return new Response(JSON.stringify({ error: '文件不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const fileData = await dataStore.get(`data:${userId}:${fileId}`, { type: 'arrayBuffer' });
      if (!fileData) {
        return new Response(JSON.stringify({ error: '文件数据不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(fileData, {
        headers: {
          'Content-Type': meta.fileType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`
        }
      });
    }

    // 列出某个tab的文件
    if (tabIndex !== null) {
      const metaJson = await metaStore.get(`meta:${userId}:tab${tabIndex}`, { type: 'text' });
      const files = metaJson ? JSON.parse(metaJson) : [];
      return new Response(JSON.stringify(files), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: '缺少参数' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { tabIndex, fileName, fileType, fileSize, fileData, uploadedBy } = body;

    if (tabIndex === undefined || !fileName || !fileData) {
      return new Response(JSON.stringify({ error: '参数不完整' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const fileId = crypto.randomUUID();
    const buffer = Uint8Array.from(atob(fileData), c => c.charCodeAt(0));

    // 存储文件数据
    await dataStore.set(`data:${userId}:${fileId}`, buffer);

    // 更新元数据列表
    const metaKey = `meta:${userId}:tab${tabIndex}`;
    const metaJson = await metaStore.get(metaKey, { type: 'text' });
    const metas = metaJson ? JSON.parse(metaJson) : [];
    metas.push({
      id: fileId,
      tabIndex: Number(tabIndex),
      fileName,
      fileType: fileType || 'application/octet-stream',
      fileSize: fileSize || 0,
      uploadedBy: uploadedBy || '',
      uploadedAt: new Date().toISOString()
    });
    await metaStore.set(metaKey, JSON.stringify(metas));

    return new Response(JSON.stringify({ success: true, id: fileId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (req.method === 'DELETE') {
    const body = await req.json();
    const { fileId, tabIndex } = body;

    if (!fileId || tabIndex === undefined) {
      return new Response(JSON.stringify({ error: '参数不完整' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 从元数据列表中移除
    const metaKey = `meta:${userId}:tab${tabIndex}`;
    const metaJson = await metaStore.get(metaKey, { type: 'text' });
    const metas = metaJson ? JSON.parse(metaJson) : [];
    const updated = metas.filter(f => f.id !== fileId);
    await metaStore.set(metaKey, JSON.stringify(updated));

    // 删除文件数据
    await dataStore.delete(`data:${userId}:${fileId}`);

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
  path: '/api/files'
};
