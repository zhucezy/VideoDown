const crypto = require('crypto');
const config = require('../config');

function b64url(input) {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function unb64url(input) {
  const s = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

function hmac(payload) {
  return crypto
    .createHmac('sha256', config.signSecret)
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
    .slice(0, 24);
}

/**
 * 生成带签名的代理直链。
 * 小程序端只允许请求白名单域名，所以所有视频/图片都必须经由本服务中转。
 */
function buildProxyUrl(targetUrl, opts = {}) {
  const exp = Math.floor(Date.now() / 1000) + (opts.ttl || config.signTtl);
  const u = b64url(targetUrl);
  const p = opts.platform || '';
  const name = opts.filename || '';
  const raw = `${u}.${exp}.${p}`;
  const s = hmac(raw);

  const qs = [
    `u=${u}`,
    `e=${exp}`,
    p ? `p=${encodeURIComponent(p)}` : '',
    name ? `n=${encodeURIComponent(name)}` : '',
    `s=${s}`,
  ]
    .filter(Boolean)
    .join('&');

  return `${config.publicBase}/api/dl?${qs}`;
}

function verifyProxy(query) {
  const { u, e, p = '', s } = query;
  if (!u || !e || !s) return { ok: false, reason: '参数缺失' };
  if (Number(e) < Math.floor(Date.now() / 1000))
    return { ok: false, reason: '链接已过期' };
  const raw = `${u}.${e}.${p}`;
  if (hmac(raw) !== s) return { ok: false, reason: '签名无效' };
  try {
    return { ok: true, url: unb64url(u), platform: p };
  } catch (err) {
    return { ok: false, reason: '地址解码失败' };
  }
}

module.exports = { buildProxyUrl, verifyProxy, b64url, unb64url };
