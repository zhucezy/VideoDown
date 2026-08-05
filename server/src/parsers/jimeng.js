const { getText, getJson, resolveRedirect, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
  safeJsonParse,
} = require('../utils/common');

const KEY = 'jimeng';
const NAME = '即梦';

function match(url) {
  return /jimeng\.jianying\.com|dreamina\.capcut\.com|jianying\.com\/.*jimeng/.test(
    url
  );
}

/**
 * 即梦（Dreamina）是字节的 AI 创作平台，作品分享页是 SSR 渲染的 Next.js 应用。
 * 数据挂在 __NEXT_DATA__ 或页面内联的 window.__INITIAL_SSR_STATE__ 上。
 * AI 生成的视频本身不带平台水印，取原始 CDN 地址即可。
 */
function extractNextData(html) {
  let m = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (m) return safeJsonParse(m[1]);

  m = html.match(/window\.__INITIAL_SSR_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (m) return safeJsonParse(m[1]);

  m = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (m) return safeJsonParse(m[1]);

  return null;
}

/** 深度遍历，捞出所有视频地址与元信息 */
function walk(node, out, depth = 0) {
  if (!node || depth > 10) return;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, out, depth + 1));
    return;
  }
  if (typeof node !== 'object') return;

  // 常见字段：video_url / playUrl / main_url / transcoded_video
  ['video_url', 'videoUrl', 'playUrl', 'play_url', 'main_url', 'mainUrl'].forEach(
    (k) => {
      const v = node[k];
      if (typeof v === 'string' && /^https?:/.test(v) && /\.(mp4|mov)/.test(v)) {
        out.urls.push({ url: v, w: node.width, h: node.height });
      }
    }
  );

  // 图片作品（即梦 AI 生图）：收集图集，避开封面字段以免与视频封面重复
  ['image_url', 'imageUrl', 'img_url', 'imgUrl', 'material_url', 'materialUrl'].forEach(
    (k) => {
      const v = node[k];
      if (
        typeof v === 'string' &&
        /^https?:/.test(v) &&
        /\.(jpg|jpeg|png|webp)/i.test(v)
      ) {
        out.images.push(v);
      }
    }
  );
  ['url_list', 'images', 'image_list', 'material_urls', 'atlas'].forEach((k) => {
    const arr = node[k];
    if (!Array.isArray(arr)) return;
    arr.forEach((it) => {
      const u =
        typeof it === 'string'
          ? it
          : it && (it.url || (it.url_list && it.url_list[0]));
      if (u && /\.(jpg|jpeg|png|webp)/i.test(u)) out.images.push(u);
    });
  });

  if (node.transcoded_video && typeof node.transcoded_video === 'object') {
    Object.values(node.transcoded_video).forEach((item) => {
      if (item && item.video_url) {
        out.urls.push({
          url: item.video_url,
          w: item.width,
          h: item.height,
          size: item.file_size,
        });
      }
    });
  }

  if (!out.title && (node.prompt || node.title || node.desc)) {
    out.title = node.prompt || node.title || node.desc;
  }
  if (!out.cover && (node.cover_url || node.coverUrl || node.image_url)) {
    out.cover = node.cover_url || node.coverUrl || node.image_url;
  }
  if (!out.author && (node.nickname || node.author_name)) {
    out.author = node.nickname || node.author_name;
  }
  if (!out.duration && node.duration) out.duration = node.duration;

  Object.keys(node).forEach((k) => walk(node[k], out, depth + 1));
}

async function parse(url) {
  let target = url;
  const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
  if (finalUrl) target = finalUrl;

  const { text: html } = await getText(target, {
    ua: UA.ios,
    headers: { Referer: 'https://jimeng.jianying.com/' },
  });

  const out = { urls: [], images: [], title: '', cover: '', author: '', duration: 0 };

  const data = extractNextData(html);
  if (data) walk(data, out);

  // 兜底 1：og:video meta
  if (!out.urls.length) {
    const og = html.match(
      /<meta[^>]+property=["']og:video(?::url|:secure_url)?["'][^>]+content=["']([^"']+)["']/i
    );
    if (og) out.urls.push({ url: og[1] });
  }
  // 兜底 2：页面里裸露的 mp4
  if (!out.urls.length) {
    const raw = html.match(/https?:\\?\/\\?\/[^"'\s]+?\.mp4[^"'\s]*/g) || [];
    raw.slice(0, 5).forEach((u) =>
      out.urls.push({ url: u.replace(/\\u002F/g, '/').replace(/\\\//g, '/') })
    );
  }

  if (!out.urls.length && !out.images.length) {
    throw new BizError(
      ERR.NOT_FOUND,
      '未获取到即梦作品地址，请确认作品已公开分享'
    );
  }

  if (!out.title) {
    const t = html.match(/<title>([^<]+)<\/title>/i);
    if (t) out.title = t[1].replace(/[-|｜].*$/, '').trim();
  }
  if (!out.cover) {
    const og = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    );
    if (og) out.cover = og[1];
  }

  const seen = new Set();
  const qualities = [];
  out.urls.forEach((item) => {
    const clean = item.url.replace(/&amp;/g, '&');
    const key = clean.split('?')[0];
    if (seen.has(key)) return;
    seen.add(key);
    qualities.push({
      url: clean,
      width: item.w || 0,
      height: item.h || 0,
      bitrate: 0,
      size: item.size || 0,
      label: resolutionLabel(item.w, item.h, '原画'),
      format: 'mp4',
    });
  });

  const seenImg = new Set();
  const images = [];
  out.images.forEach((u) => {
    const c = String(u).replace(/&amp;/g, '&').replace(/\\\//g, '/');
    const key = c.split('?')[0];
    if (seenImg.has(key)) return;
    seenImg.add(key);
    images.push({ url: c });
  });

  const idMatch = target.match(/[?&]id=([\w-]+)/) || target.match(/\/([\w-]{8,})$/);

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `jm_${idMatch ? idMatch[1] : Date.now()}`,
    title: cleanTitle(out.title),
    rawTitle: out.title || '',
    cover: out.cover || '',
    author: out.author || '',
    authorAvatar: '',
    duration: Math.round(out.duration || 0),
    durationText: durationText(out.duration),
    qualities,
    images,
    proxyHeaders: {
      Referer: 'https://jimeng.jianying.com/',
      'User-Agent': UA.ios,
    },
  };
}

module.exports = { key: KEY, name: NAME, match, parse };
