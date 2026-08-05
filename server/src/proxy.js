const { Readable } = require('stream');
const { verifyProxy } = require('./utils/sign');
const { req } = require('./utils/http');

/** 平台 → 回源时需要携带的请求头（防盗链绕过） */
const REFERER_MAP = {
  douyin: {
    Referer: 'https://www.douyin.com/',
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  weibo: { Referer: 'https://weibo.com/' },
  xiaohongshu: { Referer: 'https://www.xiaohongshu.com/' },
  kuaishou: { Referer: 'https://www.kuaishou.com/' },
  bilibili: {
    Referer: 'https://www.bilibili.com/',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
  jimeng: { Referer: 'https://jimeng.jianying.com/' },
  wxchannels: {
    Referer: 'https://channels.weixin.qq.com/',
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44',
  },
};

/**
 * 视频/图片流式中转
 *
 * 为什么必须中转：
 *   1. 小程序 wx.downloadFile 只允许请求「downloadFile 合法域名」，
 *      而各平台 CDN 域名成百上千且随时变化，无法逐一加白名单
 *   2. 多数 CDN 有 Referer / UA 防盗链，小程序端无法自定义 Referer
 *   3. 中转层可以统一做签名校验、限速与审计
 */
async function handleProxy(request, response) {
  const check = verifyProxy(request.query);
  if (!check.ok) {
    response.status(403).json({ code: 4003, message: check.reason });
    return;
  }

  const targetUrl = check.url;
  const platform = check.platform;
  const filename = request.query.n || 'video.mp4';

  const headers = Object.assign(
    {
      Accept: '*/*',
      'Accept-Encoding': 'identity',
    },
    REFERER_MAP[platform] || {}
  );

  // 透传 Range，支持断点续传与播放器拖动
  if (request.headers.range) headers.Range = request.headers.range;

  let upstream;
  try {
    upstream = await req(targetUrl, {
      method: 'GET',
      headers,
      redirect: 'follow',
      timeout: 30000,
    });
  } catch (e) {
    response.status(502).json({ code: 5002, message: '回源失败：' + e.message });
    return;
  }

  if (!upstream.ok && upstream.status !== 206) {
    response
      .status(upstream.status === 404 ? 404 : 502)
      .json({ code: 5002, message: `源站返回 ${upstream.status}` });
    return;
  }

  // 透传关键响应头
  const passthrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ];
  passthrough.forEach((h) => {
    const v = upstream.headers.get(h);
    if (v) response.setHeader(h, v);
  });

  if (!upstream.headers.get('content-type')) {
    response.setHeader(
      'content-type',
      /\.(jpg|jpeg|png|webp)/i.test(targetUrl) ? 'image/jpeg' : 'video/mp4'
    );
  }
  response.setHeader('accept-ranges', 'bytes');
  response.setHeader('cache-control', 'public, max-age=3600');
  response.setHeader(
    'content-disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );

  response.status(upstream.status === 206 ? 206 : 200);

  if (!upstream.body) {
    response.end();
    return;
  }

  // WHATWG ReadableStream → Node Readable
  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on('error', () => {
    if (!response.headersSent) response.status(502);
    response.end();
  });
  request.on('close', () => nodeStream.destroy());
  nodeStream.pipe(response);
}

module.exports = { handleProxy, REFERER_MAP };
