'use strict';

/**
 * 华为云 FunctionGraph（事件函数）+ APIG HTTP 触发器 适配入口
 *
 * 思路：现有 Express 应用（src/index.js 导出的 app）不依赖任何框架包装层，
 * 这里启动一个「本地回环 HTTP server」承载它，每个冷启动实例只启动一次；
 * 之后每次 APIG 请求进来，handler 把 APIG 的 event 翻译成 HTTP 请求，
 * 转发给 127.0.0.1:PORT 的本地 server，再把响应原样返回给 APIG。
 *
 * 这样现有 Express 代码（路由、中间件、8 个平台解析器）一行都不用改。
 *
 * 执行入口配置：handler = huawei-handler.handler
 * 环境变量：FUNCTIONGRAPH=1（让 src/index.js 不自己 listen）、PORT=8000（可选）
 */

const http = require('http');
const app = require('./src/index'); // Express app，已挂载全部路由；不会自己 listen（见 src/index.js 守卫）

const PORT = parseInt(process.env.PORT || '8000', 10);

// 每个冷启动实例只启动一次回环 server，后续请求复用
let serverReady;
function ensureServer() {
  if (!serverReady) {
    serverReady = new Promise((resolve, reject) => {
      const srv = http.createServer(app);
      srv.once('error', reject);
      srv.listen(PORT, '127.0.0.1', () => resolve(srv));
    });
  }
  return serverReady;
}

// 兼容新旧两种 APIG 事件格式：
//  - 新版（扁平）：{ method, path, headers, queryString, body, isBase64Encoded }
//  - 旧版（嵌套）：{ events: { httpMethod, path, headers, queryStringParameters, body, isBase64Encoded } }
function normalizeEvent(raw) {
  let e = raw;
  if (typeof e === 'string') {
    try {
      e = JSON.parse(e);
    } catch (_) {
      e = {};
    }
  }
  if (e && e.events) e = e.events;

  const method = (e.httpMethod || e.method || 'GET').toUpperCase();
  const path = e.path || '/';
  const headers = e.headers || {};
  const query = e.queryStringParameters || e.queryString || {};

  let body = e.body || '';
  if (e.isBase64Encoded && body) {
    body = Buffer.from(body, 'base64'); // 解码请求体（APIG 默认对请求体做 Base64）
  }
  return { method, path, headers, query, body };
}

function forwardToLocal(norm) {
  return new Promise((resolve, reject) => {
    const qs = Object.keys(norm.query)
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(norm.query[k])}`)
      .join('&');
    const pathWithQuery = qs ? `${norm.path}?${qs}` : norm.path;

    // 去掉 Host，避免回环时 Host 不匹配；其余转发头原样保留
    const fwdHeaders = { ...norm.headers };
    delete fwdHeaders.host;
    delete fwdHeaders.Host;

    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: pathWithQuery,
        method: norm.method,
        headers: fwdHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const ct = (res.headers['content-type'] || '').toLowerCase();
          const isText = /json|text\/|xml|application\/(.*?\+)?(json|xml)/.test(ct) || buf.length === 0;

          // 清理逐跳头，避免 APIG 误处理
          const outHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            const lk = k.toLowerCase();
            if (lk === 'transfer-encoding' || lk === 'connection' || lk === 'keep-alive') continue;
            outHeaders[k] = v;
          }

          resolve({
            statusCode: res.statusCode,
            headers: outHeaders,
            isBase64Encoded: !isText,
            body: isText ? buf.toString('utf-8') : buf.toString('base64'),
          });
        });
      }
    );
    req.on('error', reject);
    if (norm.body) req.write(norm.body); // Buffer 或 string 均可
    req.end();
  });
}

exports.handler = async (event, context) => {
  await ensureServer();
  const norm = normalizeEvent(event);
  return forwardToLocal(norm);
};
