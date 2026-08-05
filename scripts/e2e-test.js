/**
 * 端到端测试：启动真实服务 + 本地假源站，验证完整下载链路
 * 运行: node scripts/e2e-test.js
 */
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const ORIGIN_PORT = 3598;
const API_PORT = 3599;
const SECRET = 'e2e-test-secret-1234567890';
const API = `http://127.0.0.1:${API_PORT}`;

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`);
  }
}

// ============ 1. 假源站：模拟带防盗链的视频 CDN ============
const FILE_SIZE = 512 * 1024;
const payload = Buffer.alloc(FILE_SIZE, 0x42);

const origin = http.createServer((req, res) => {
  // 模拟 Referer 防盗链：没带正确 Referer 直接 403
  if (req.url.startsWith('/protected.mp4')) {
    if (req.headers.referer !== 'https://www.douyin.com/') {
      res.writeHead(403, { 'content-type': 'text/plain' });
      return res.end('forbidden: bad referer');
    }
  }

  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = Number(m[1] || 0);
    const end = m[2] ? Number(m[2]) : FILE_SIZE - 1;
    res.writeHead(206, {
      'content-type': 'video/mp4',
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${FILE_SIZE}`,
      'accept-ranges': 'bytes',
    });
    return res.end(payload.subarray(start, end + 1));
  }

  res.writeHead(200, {
    'content-type': 'video/mp4',
    'content-length': FILE_SIZE,
    'accept-ranges': 'bytes',
  });
  res.end(payload);
});

// ============ 2. 启动被测服务 ============
function startApi() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '..', 'server', 'src', 'index.js')],
      {
        env: Object.assign({}, process.env, {
          PORT: String(API_PORT),
          PUBLIC_BASE: API,
          SIGN_SECRET: SECRET,
          RATE_MAX: '100',
        }),
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.includes('监听端口')) resolve(child);
    });
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', reject);
    setTimeout(() => reject(new Error('服务启动超时')), 10000);
  });
}

async function main() {
  await new Promise((r) => origin.listen(ORIGIN_PORT, r));
  console.log(`\n假源站已启动: http://127.0.0.1:${ORIGIN_PORT}`);

  const api = await startApi();
  console.log(`被测服务已启动: ${API}\n`);

  // 签名工具必须用相同 secret / base
  process.env.SIGN_SECRET = SECRET;
  process.env.PUBLIC_BASE = API;
  const { buildProxyUrl } = require(path.join(
    __dirname, '..', 'server', 'src', 'utils', 'sign'
  ));

  try {
    console.log('[1] 基础接口');
    const health = await fetch(`${API}/health`).then((r) => r.json());
    ok('/health 返回 code 0', health.code === 0);

    const plats = await fetch(`${API}/api/platforms`).then((r) => r.json());
    ok('/api/platforms 返回 7 个平台',
      plats.data.platforms.length === 7, String(plats.data.platforms.length));

    console.log('\n[2] 参数校验');
    const bad = await fetch(`${API}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: '这不是链接' }),
    }).then((r) => r.json());
    ok('非法链接返回 4001', bad.code === 4001, JSON.stringify(bad));

    const unreachable = await fetch(`${API}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://this-domain-does-not-exist-xyz123.com/v/1' }),
    }).then((r) => r.json());
    ok('抓取失败返回结构化错误而非崩溃',
      unreachable.code !== 0 && typeof unreachable.message === 'string',
      JSON.stringify(unreachable));

    console.log('\n[3] 代理中转：完整下载');
    const proxyUrl = buildProxyUrl(
      `http://127.0.0.1:${ORIGIN_PORT}/video.mp4`,
      { platform: 'test', filename: '测试.mp4' }
    );
    const dl = await fetch(proxyUrl);
    const buf = Buffer.from(await dl.arrayBuffer());
    ok('状态码 200', dl.status === 200, String(dl.status));
    ok(`完整拉取 ${FILE_SIZE} 字节`, buf.length === FILE_SIZE, String(buf.length));
    ok('content-type 透传', dl.headers.get('content-type') === 'video/mp4');
    ok('声明支持 Range', dl.headers.get('accept-ranges') === 'bytes');
    ok('带 content-disposition 文件名',
      /attachment/.test(dl.headers.get('content-disposition') || ''));
    ok('内容完整未损坏', buf[0] === 0x42 && buf[buf.length - 1] === 0x42);

    console.log('\n[4] 代理中转：Range 断点续传');
    const partial = await fetch(proxyUrl, { headers: { Range: 'bytes=100-199' } });
    const pbuf = Buffer.from(await partial.arrayBuffer());
    ok('状态码 206', partial.status === 206, String(partial.status));
    ok('返回 100 字节', pbuf.length === 100, String(pbuf.length));
    ok('content-range 正确',
      partial.headers.get('content-range') === `bytes 100-199/${FILE_SIZE}`,
      partial.headers.get('content-range'));

    console.log('\n[5] 防盗链绕过');
    const protectedUrl = buildProxyUrl(
      `http://127.0.0.1:${ORIGIN_PORT}/protected.mp4`,
      { platform: 'douyin' }
    );
    const prot = await fetch(protectedUrl);
    ok('服务端自动补 Referer 后成功回源', prot.status === 200, String(prot.status));
    await prot.arrayBuffer();

    const noRefererUrl = buildProxyUrl(
      `http://127.0.0.1:${ORIGIN_PORT}/protected.mp4`,
      { platform: 'unknown-platform' }
    );
    const noRef = await fetch(noRefererUrl);
    ok('未知平台不带 Referer 时源站拒绝（证明防盗链生效）',
      noRef.status === 502, String(noRef.status));

    console.log('\n[6] 签名安全');
    const u = new URL(proxyUrl);
    u.searchParams.set('s', 'forged-signature-xxx');
    const forged = await fetch(u.toString());
    ok('伪造签名被拒 403', forged.status === 403, String(forged.status));

    const u2 = new URL(proxyUrl);
    u2.searchParams.set('e', '1000000000');
    const expired = await fetch(u2.toString());
    ok('过期链接被拒 403', expired.status === 403, String(expired.status));

    const u3 = new URL(proxyUrl);
    u3.searchParams.delete('s');
    const noSign = await fetch(u3.toString());
    ok('无签名被拒 403', noSign.status === 403, String(noSign.status));

    console.log('\n[7] 限流');
    const limited = await Promise.all(
      Array.from({ length: 12 }, () =>
        fetch(`${API}/api/platforms`).then((r) => r.status)
      )
    );
    ok('正常频率不误伤', limited.every((s) => s === 200));

    console.log('\n[8] 404 兜底');
    const nf = await fetch(`${API}/api/not-exist`);
    ok('未知路由返回 404 JSON', nf.status === 404);
  } finally {
    api.kill();
    origin.close();
  }

  console.log(`\n${'='.repeat(46)}`);
  console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
  console.log('='.repeat(46) + '\n');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('测试异常:', e);
  process.exit(1);
});
