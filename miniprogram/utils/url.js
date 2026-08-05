/**
 * 从分享口令 / 混杂文案中提取纯净 URL。
 * 各平台分享出来的文本形如：
 *   7.65 复制打开抖音，看看【xxx】 https://v.douyin.com/iRxxxx/ 复制此链接...
 *   发现一个有趣的视频 https://xhslink.com/a/xxxxx，复制本条信息...
 */
const URL_RE = /(https?:\/\/[-A-Za-z0-9+&@#/%?=~_|!:,.;()*$]+[-A-Za-z0-9+&@#/%=~_|$])/g;

/** 结尾常见的中文标点 / 全角符号，需要剥离 */
const TAIL_TRIM = /[，,。、；;：:！!？?”"’'）)】\]\s]+$/;

function extractUrls(text) {
  if (!text) return [];
  const raw = String(text).replace(/\u00A0/g, ' ');
  const found = raw.match(URL_RE) || [];
  return found
    .map((u) => u.replace(TAIL_TRIM, ''))
    .filter((u) => u.length > 10);
}

/** 取第一条链接；没有 http 前缀时尝试补全裸域名 */
function extractFirstUrl(text) {
  const list = extractUrls(text);
  if (list.length) return list[0];

  const bare = String(text || '').match(
    /((?:[\w-]+\.)+(?:com|cn|tv|net|top|vip|link|qq|video)(?:\/[^\s，,。；;！!？?]*)?)/i
  );
  if (bare) return `https://${bare[1].replace(TAIL_TRIM, '')}`;
  return '';
}

function getHost(url) {
  const m = String(url || '').match(/^https?:\/\/([^/?#:]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/** 字节数 → 可读大小 */
function formatSize(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/** 秒 → mm:ss */
function formatDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  if (!s) return '';
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

function formatTime(ts) {
  const d = new Date(Number(ts) || Date.now());
  const p = (n) => (n < 10 ? `0${n}` : `${n}`);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return sameDay ? `今天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

module.exports = {
  extractUrls,
  extractFirstUrl,
  getHost,
  formatSize,
  formatDuration,
  formatTime,
};
