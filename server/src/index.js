const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const config = require('./config');
const { resolveParser, listPlatforms } = require('./parsers');
const { handleProxy } = require('./proxy');
const { buildProxyUrl } = require('./utils/sign');
const { probe } = require('./utils/http');
const {
  BizError,
  ERR,
  pickUrl,
  sizeText,
  sortQualities,
} = require('./utils/common');

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false }));

// ===================== 简易内存限流 =====================
const buckets = new Map();
function rateLimit(req, res, next) {
  // 代理下载不参与解析限流
  if (req.path === '/api/dl') return next();

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';
  const now = Date.now();
  const rec = buckets.get(ip) || { count: 0, reset: now + config.rateLimit.windowMs };

  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + config.rateLimit.windowMs;
  }
  rec.count += 1;
  buckets.set(ip, rec);

  if (rec.count > config.rateLimit.max) {
    return res.status(429).json({
      code: ERR.RATE_LIMIT,
      message: '请求过于频繁，请稍后再试',
    });
  }
  next();
}
app.use(rateLimit);

// 定期清理过期的限流桶
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.reset + 60000) buckets.delete(k);
}, 120000).unref();

// ===================== 健康检查 =====================
app.get('/health', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { time: Date.now() } });
});

// ===================== 平台清单 =====================
app.get('/api/platforms', (req, res) => {
  res.json({ code: 0, message: 'ok', data: { platforms: listPlatforms() } });
});

// ===================== 小程序静默登录 =====================
app.post('/api/auth/login', async (req, res) => {
  const { code } = req.body || {};
  if (!code) {
    return res.json({ code: 4001, message: '缺少 code' });
  }
  if (!config.wx.appId || !config.wx.appSecret) {
    // 未配置小程序凭据时发放匿名 token，保证前端流程可用
    const token = crypto.randomBytes(16).toString('hex');
    return res.json({ code: 0, message: 'ok', data: { token, anonymous: true } });
  }

  try {
    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${config.wx.appId}` +
      `&secret=${config.wx.appSecret}&js_code=${code}&grant_type=authorization_code`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.openid) {
      return res.json({ code: 4010, message: data.errmsg || '登录失败' });
    }
    // 生产环境请换成 JWT 并持久化 session_key
    const token = crypto
      .createHmac('sha256', config.signSecret)
      .update(data.openid)
      .digest('hex');
    res.json({ code: 0, message: 'ok', data: { token } });
  } catch (e) {
    res.json({ code: 5000, message: '登录服务异常' });
  }
});

// ===================== 核心：解析 =====================
app.post('/api/parse', async (req, res) => {
  const started = Date.now();
  const input = (req.body && (req.body.url || req.body.text)) || '';
  const url = pickUrl(input) || String(input).trim();

  if (!/^https?:\/\//i.test(url)) {
    return res.json({ code: ERR.BAD_URL, message: '请提供有效的视频链接' });
  }

  const parser = resolveParser(url);
  if (!parser) {
    return res.json({ code: ERR.UNSUPPORTED, message: '暂不支持该平台' });
  }

  try {
    const result = await parser.parse(url);

    // 1. 排序，保证第 0 项是最高分辨率
    let qualities = sortQualities(result.qualities || []);

    // 2. 探测最高档的真实体积（前 2 档即可，避免请求过多拖慢响应）
    await Promise.all(
      qualities.slice(0, 2).map(async (q) => {
        if (q.size) return;
        const info = await probe(q.url, result.proxyHeaders || {});
        if (info.size) q.size = info.size;
        if (info.finalUrl) q.url = info.finalUrl;
      })
    );

    // 3. 全部改写为带签名的代理直链（小程序只能下载白名单域名）
    const safeName = (result.title || 'video')
      .replace(/[\\/:*?"<>|\s]+/g, '_')
      .slice(0, 40);

    qualities = qualities.map((q, i) => ({
      label: q.label,
      width: q.width,
      height: q.height,
      bitrate: q.bitrate,
      size: q.size,
      sizeText: sizeText(q.size),
      format: q.format,
      unsupported: !!q.unsupported,
      originUrl: q.url,
      url: buildProxyUrl(q.url, {
        platform: result.platform,
        filename: `${safeName}_${q.label || i}.${q.format || 'mp4'}`,
      }),
    }));

    const images = (result.images || []).map((img, i) => {
      const raw = img.url || img;
      return {
        width: img.width,
        height: img.height,
        originUrl: raw,
        url: buildProxyUrl(raw, {
          platform: result.platform,
          filename: `${safeName}_${i + 1}.jpg`,
        }),
      };
    });

    // 纯图片 / 图集内容没有视频封面，用第一张图兜底，避免前端预览空白
    const coverRaw = result.cover || '';
    const coverProxy = coverRaw
      ? buildProxyUrl(coverRaw, { platform: result.platform })
      : '';
    const coverDownloadProxy = coverRaw
      ? buildProxyUrl(coverRaw, {
          platform: result.platform,
          filename: `${safeName}_cover.jpg`,
        })
      : '';
    const coverSrc = coverRaw || (images[0] && images[0].url) || '';

    res.json({
      code: 0,
      message: 'ok',
      data: Object.assign({}, result, {
        qualities,
        images,
        // 封面也走代理（或复用已代理的首图），避免小程序 image 组件被防盗链拦截
        cover: coverSrc ? (coverRaw ? coverProxy : coverSrc) : '',
        coverDownload: coverSrc
          ? coverRaw
            ? coverDownloadProxy
            : coverSrc
          : '',
        authorAvatar: result.authorAvatar
          ? buildProxyUrl(result.authorAvatar, { platform: result.platform })
          : '',
        // 安卓直连场景：透传 proxyHeaders，供客户端直连源站时绕过防盗链
        proxyHeaders: result.proxyHeaders || {},
        cost: Date.now() - started,
      }),
    });
  } catch (err) {
    const code = err instanceof BizError ? err.code : ERR.UPSTREAM;
    const message = err.message || '解析失败，请稍后重试';
    console.error(`[parse fail] ${parser.key} ${url} → ${message}`);
    res.json({ code, message });
  }
});

// ===================== 视频/图片流式中转 =====================
// Vercel 等 Serverless 环境无法做流式中转（超时/响应体限制），提示客户端直连 originUrl
app.get('/api/dl', process.env.VERCEL
  ? (req, res) => res.status(501).json({ code: 5001, message: '当前部署环境不支持代理下载，请客户端使用 originUrl 直连源站' })
  : handleProxy);

// ===================== 兜底 =====================
app.use((req, res) => {
  res.status(404).json({ code: 4004, message: '接口不存在' });
});

app.use((err, req, res, next) => {
  console.error('[server error]', err);
  res.status(500).json({ code: 5000, message: '服务内部错误' });
});

// Vercel / FunctionGraph 等 Serverless 平台由平台接管请求，不在此 listen
// （FunctionGraph 由 huawei-handler.js 启动本地回环 server 承载 app）
if (!process.env.VERCEL && !process.env.FUNCTIONGRAPH) {
  app.listen(config.port, config.host, () => {
    console.log(`\n  视频解析服务已启动`);
    console.log(`  监听地址: http://${config.host}:${config.port}`);
    console.log(`  对外地址: ${config.publicBase}`);
    console.log(`  已注册平台: ${listPlatforms().map((p) => p.name).join('、')}\n`);
    if (config.signSecret === 'change-this-to-a-random-secret') {
      console.warn('  ⚠️  SIGN_SECRET 仍是默认值，上线前务必修改！\n');
    }
  });
}

// 供 Vercel Serverless 入口（api/index.js）包装成函数使用
module.exports = app;
