const { getText, resolveRedirect, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
  safeJsonParse,
} = require('../utils/common');
const config = require('../config');

const KEY = 'kuaishou';
const NAME = '快手';

function match(url) {
  return /kuaishou\.com|gifshow\.com|chenzhongtech\.com|kwai/.test(url);
}

/** 从 H5 页面里抓 window.INIT_STATE / __APOLLO_STATE__ */
function extractState(html) {
  let m = html.match(/window\.INIT_STATE\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (m) return safeJsonParse(m[1]);
  m = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});/);
  if (m) return safeJsonParse(m[1]);
  return null;
}

/** 深度遍历，收集所有 photoUrl / mainMvUrls，兼容快手频繁变动的数据结构 */
function collectVideo(node, out, depth = 0) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectVideo(n, out, depth + 1));
    return;
  }
  if (typeof node !== 'object') return;

  if (typeof node.photoUrl === 'string' && node.photoUrl.includes('.mp4')) {
    out.urls.push({ url: node.photoUrl, w: node.width, h: node.height });
  }
  if (Array.isArray(node.mainMvUrls)) {
    node.mainMvUrls.forEach((m) => {
      if (m && m.url) out.urls.push({ url: m.url, w: node.width, h: node.height });
    });
  }
  if (Array.isArray(node.adaptationSet)) {
    node.adaptationSet.forEach((set) => {
      (set.representation || []).forEach((r) => {
        if (r && r.url) {
          out.urls.push({
            url: r.url,
            w: r.width,
            h: r.height,
            bitrate: r.avgBitrate || r.maxBitrate,
            label: r.qualityLabel,
          });
        }
      });
    });
  }
  if (node.caption && !out.title) out.title = node.caption;
  if (node.coverUrl && !out.cover) out.cover = node.coverUrl;
  if (Array.isArray(node.coverUrls) && node.coverUrls[0] && !out.cover) {
    out.cover = node.coverUrls[0].url;
  }
  if (node.userName && !out.author) out.author = node.userName;
  if (node.duration && !out.duration) out.duration = node.duration;

  // 图集 / 图片笔记
  if (node.atlas && Array.isArray(node.atlas.list)) {
    node.atlas.list.forEach((it) => {
      const u = it && (it.url || (it.url_list && it.url_list[0]));
      if (u) out.imageUrls.push(u);
    });
  }
  if (Array.isArray(node.images)) {
    node.images.forEach((it) => {
      const u =
        typeof it === 'string' ? it : it && (it.url || (it.url_list && it.url_list[0]));
      if (u) out.imageUrls.push(u);
    });
  }

  Object.keys(node).forEach((k) => collectVideo(node[k], out, depth + 1));
}

async function parse(url) {
  let target = url;
  if (/v\.kuaishou\.com|chenzhongtech\.com\/fw/.test(url)) {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
    target = finalUrl;
  }

  const idMatch = target.match(/(?:short-video|photo|fw\/photo)\/([\w-]+)/);
  const photoId = idMatch ? idMatch[1] : '';

  // 移动端 H5 页风控相对宽松
  const pageUrl = photoId
    ? `https://www.kuaishou.com/short-video/${photoId}`
    : target;

  const { text: html } = await getText(pageUrl, {
    ua: UA.android,
    headers: {
      Referer: 'https://www.kuaishou.com/',
      Cookie: config.cookies.kuaishou || '',
    },
  });

  if (/验证|captcha|滑块/.test(html) && !/photoUrl/.test(html)) {
    throw new BizError(
      ERR.UPSTREAM,
      '快手触发了风控验证，请在服务端配置 COOKIE_KUAISHOU 后重试'
    );
  }

  const state = extractState(html);
  const out = { urls: [], imageUrls: [], title: '', cover: '', author: '', duration: 0 };
  if (state) collectVideo(state, out);

  // 最后兜底：直接从 HTML 里正则捞 mp4
  if (!out.urls.length) {
    const raw = html.match(/https?:\\?\/\\?\/[^"'\s]+?\.mp4[^"'\s]*/g) || [];
    raw.forEach((u) => out.urls.push({ url: u.replace(/\\\//g, '/') }));
  }

  if (!out.urls.length && !out.imageUrls.length) {
    throw new BizError(ERR.NOT_FOUND, '未获取到快手视频地址，作品可能已删除');
  }

  const seen = new Set();
  const qualities = [];
  out.urls.forEach((item) => {
    const clean = item.url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    const key = clean.split('?')[0];
    if (seen.has(key)) return;
    seen.add(key);
    qualities.push({
      url: clean,
      width: item.w || 0,
      height: item.h || 0,
      bitrate: item.bitrate || 0,
      size: 0,
      label: item.label || resolutionLabel(item.w, item.h, '原画'),
      format: 'mp4',
    });
  });

  const dur = Math.round((out.duration || 0) / 1000);

  const seenImg = new Set();
  const images = [];
  out.imageUrls.forEach((u) => {
    const c = String(u).replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    const key = c.split('?')[0];
    if (seenImg.has(key)) return;
    seenImg.add(key);
    images.push({ url: c });
  });

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `ks_${photoId || Date.now()}`,
    title: cleanTitle(out.title),
    rawTitle: out.title || '',
    cover: out.cover || '',
    author: out.author || '',
    authorAvatar: '',
    duration: dur,
    durationText: durationText(dur),
    qualities,
    images,
    proxyHeaders: {
      Referer: 'https://www.kuaishou.com/',
      'User-Agent': UA.android,
    },
  };
}

module.exports = { key: KEY, name: NAME, match, parse };
