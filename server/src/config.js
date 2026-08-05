// 本地联调时加载 .env（生产环境无 .env 也不影响，dotenv 会优雅跳过）
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',

  // 对外访问的基础地址（代理直链会基于它生成，客户端下载时必须可达）：
  // 1) 优先用显式设置的 PUBLIC_BASE（适用于 Render / Koyeb / 任何平台）
  // 2) 部署在 Railway 时，自动用平台注入的 RAILWAY_PUBLIC_DOMAIN
  // 3) 最后回退到本地默认值（联调时改这里或 .env 即可）
  publicBase:
    process.env.PUBLIC_BASE
    || (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : '')
    || 'https://api.yourdomain.com',

  // 代理直链签名密钥，务必改成随机长字符串
  signSecret: process.env.SIGN_SECRET || 'change-this-to-a-random-secret',

  // 代理链接有效期（秒）
  signTtl: Number(process.env.SIGN_TTL || 7200),

  // 小程序凭据（用于 /api/auth/login 换 openid）
  wx: {
    appId: process.env.WX_APPID || '',
    appSecret: process.env.WX_SECRET || '',
  },

  // 简易限流
  rateLimit: {
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_MAX || 20),
  },

  // 部分平台需要登录态才能拿到完整数据，可按需填入
  cookies: {
    douyin: process.env.COOKIE_DOUYIN || '',
    kuaishou: process.env.COOKIE_KUAISHOU || '',
    xiaohongshu: process.env.COOKIE_XHS || '',
    bilibili: process.env.COOKIE_BILI || '',
    weibo: process.env.COOKIE_WEIBO || '',
  },

  // 抓取超时
  fetchTimeout: Number(process.env.FETCH_TIMEOUT || 12000),
};
