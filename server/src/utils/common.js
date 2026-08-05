/** 业务异常，带自定义 code 供小程序端做差异化提示 */
class BizError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const ERR = {
  BAD_URL: 4001,
  NOT_FOUND: 4004,
  RATE_LIMIT: 4029,
  UNSUPPORTED: 4090,
  UPSTREAM: 5001,
};

/** 从任意文本中提取第一条 URL */
function pickUrl(text) {
  if (!text) return '';
  const m = String(text).match(
    /https?:\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;()*$]+[-A-Za-z0-9+&@#/%=~_|$]/
  );
  return m ? m[0].replace(/[，,。、；;：:！!？?”"’'）)】\]]+$/, '') : '';
}

/** 秒 → mm:ss */
function durationText(sec) {
  const s = Math.round(Number(sec) || 0);
  if (!s) return '';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function sizeText(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1048576).toFixed(1)}MB`;
}

/** 按短边给出人类可读的清晰度标签 */
function resolutionLabel(width, height, fallback) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return fallback || '标清';
  const shortSide = Math.min(w, h);
  if (shortSide >= 2160) return '4K';
  if (shortSide >= 1440) return '2K';
  if (shortSide >= 1080) return '1080P';
  if (shortSide >= 720) return '720P';
  if (shortSide >= 540) return '540P';
  if (shortSide >= 480) return '480P';
  return `${shortSide}P`;
}

/**
 * 清晰度去重 + 倒序：分辨率 > 码率 > 体积
 * 保证 qualities[0] 一定是可下载的最高画质
 */
function sortQualities(list) {
  const seen = new Set();
  return list
    .filter((q) => {
      if (!q || !q.url) return false;
      const key = `${q.width}x${q.height}_${q.bitrate || 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const ra = (a.width || 0) * (a.height || 0);
      const rb = (b.width || 0) * (b.height || 0);
      if (rb !== ra) return rb - ra;
      if ((b.bitrate || 0) !== (a.bitrate || 0))
        return (b.bitrate || 0) - (a.bitrate || 0);
      return (b.size || 0) - (a.size || 0);
    });
}

/** 清洗标题里的话题标签与推广后缀 */
function cleanTitle(raw) {
  return String(raw || '')
    .replace(/#[^\s#]+/g, '')
    .replace(/@[^\s@]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** __INITIAL_STATE__ 之类的 JS 字面量里常有 undefined，需要处理后才能 JSON.parse */
function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    try {
      return JSON.parse(text.replace(/undefined/g, 'null'));
    } catch (e2) {
      return null;
    }
  }
}

module.exports = {
  BizError,
  ERR,
  pickUrl,
  durationText,
  sizeText,
  resolutionLabel,
  sortQualities,
  cleanTitle,
  safeJsonParse,
};
