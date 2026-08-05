const { getText, resolveRedirect, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
  safeJsonParse,
} = require('../utils/common');

const KEY = 'generic';
const NAME = '通用';

/** 已知可用通用策略拿下的平台，用于显示更友好的名字 */
const KNOWN = [
  { re: /pipix\.com/, key: 'pipixia', name: '皮皮虾' },
  { re: /ixigua\.com/, key: 'xigua', name: '西瓜视频' },
  { re: /zhihu\.com/, key: 'zhihu', name: '知乎' },
  { re: /weishi\.qq\.com/, key: 'weishi', name: '微视' },
  { re: /toutiao\.com/, key: 'toutiao', name: '今日头条' },
  { re: /huoshan\.com/, key: 'huoshan', name: '抖音火山版' },
  { re: /qq\.com\/x\/page|v\.qq\.com/, key: 'tencent', name: '腾讯视频' },
  { re: /meipai\.com/, key: 'meipai', name: '美拍' },
  { re: /youku\.com/, key: 'youku', name: '优酷' },
  { re: /momocdn|immomo\.com/, key: 'momo', name: '陌陌' },
  { re: /quanmin\.hao222|haokan\.baidu/, key: 'haokan', name: '好看视频' },
  { re: /lvzhou|zuiyou|xiaochuankeji/, key: 'zuiyou', name: '最右' },
];

/** 兜底解析器永远匹配，注册时必须放在数组最后 */
function match() {
  return true;
}

function identify(url) {
  const hit = KNOWN.find((k) => k.re.test(url));
  return hit || { key: KEY, name: '未知平台' };
}

/** 从 HTML 中广撒网收集视频候选地址 */
function collect(html) {
  const urls = [];

  // 1. og:video 系列 meta
  const metaRe =
    /<meta[^>]+(?:property|name)=["'](?:og:video(?::url|:secure_url)?|twitter:player:stream)["'][^>]+content=["']([^"']+)["']/gi;
  let m;
  while ((m = metaRe.exec(html))) urls.push(m[1]);

  // 2. <video src> / <source src>
  const tagRe = /<(?:video|source)[^>]+src=["']([^"']+\.(?:mp4|m3u8|mov)[^"']*)["']/gi;
  while ((m = tagRe.exec(html))) urls.push(m[1]);

  // 3. JSON 里的 mp4（覆盖大部分 SSR 页面）
  const jsonRe = /https?:\\?\/\\?\/[^"'\s\\]+?\.mp4[^"'\s\\]*/gi;
  while ((m = jsonRe.exec(html))) urls.push(m[0]);

  // 4. video_url / playAddr 等常见字段
  const fieldRe =
    /["'](?:video_url|videoUrl|playAddr|play_url|playUrl|url_hd|url_sd|mainUrl)["']\s*:\s*["']([^"']+)["']/gi;
  while ((m = fieldRe.exec(html))) urls.push(m[1]);

  return urls
    .map((u) =>
      u
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&')
        .trim()
    )
    .filter((u) => /^https?:\/\//.test(u));
}

/** 从 HTML 收集图片地址（用于纯图片页 / 图集） */
function collectImages(html) {
  const urls = [];
  const og =
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/gi;
  let m;
  while ((m = og.exec(html))) urls.push(m[1]);
  const fieldRe =
    /["'](?:image_url|imageUrl|picUrl|pic_url|materialUrl|url_list)["']\s*:\s*["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi;
  while ((m = fieldRe.exec(html))) urls.push(m[1]);
  return urls
    .map((u) =>
      u.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').trim()
    )
    .filter((u) => /^https?:\/\//.test(u));
}

function pickMeta(html) {
  const get = (re) => {
    const m = html.match(re);
    return m ? m[1].trim() : '';
  };
  return {
    title:
      get(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
      ) || get(/<title>([^<]+)<\/title>/i),
    cover: get(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ),
    author: get(
      /<meta[^>]+(?:property|name)=["'](?:og:site_name|author)["'][^>]+content=["']([^"']+)["']/i
    ),
    duration: Number(
      get(
        /<meta[^>]+property=["']og:video:duration["'][^>]+content=["'](\d+)["']/i
      ) || 0
    ),
  };
}

async function parse(url) {
  const info = identify(url);

  let target = url;
  try {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
    if (finalUrl) target = finalUrl;
  } catch (e) {}

  let html = '';
  try {
    const r = await getText(target, {
      ua: UA.ios,
      headers: { Referer: new URL(target).origin + '/' },
    });
    html = r.text;
  } catch (e) {
    throw new BizError(ERR.UPSTREAM, '页面抓取失败，站点可能拒绝了访问');
  }

  const found = collect(html);
  const imgUrls = collectImages(html);
  if (!found.length && !imgUrls.length) {
    throw new BizError(
      ERR.UNSUPPORTED,
      '暂不支持该站点，或内容需要登录后才能查看'
    );
  }

  const seen = new Set();
  const qualities = [];
  found.forEach((u) => {
    const key = u.split('?')[0];
    if (seen.has(key)) return;
    seen.add(key);
    // m3u8 无法直接保存到相册，标注出来但排在后面
    const isHls = /\.m3u8/.test(u);
    qualities.push({
      url: u,
      width: 0,
      height: isHls ? 0 : 1,
      bitrate: 0,
      size: 0,
      label: isHls ? 'HLS 流' : '原画',
      format: isHls ? 'm3u8' : 'mp4',
      unsupported: isHls,
    });
  });

  const meta = pickMeta(html);

  const seenImg = new Set();
  const images = [];
  imgUrls.forEach((u) => {
    const key = u.split('?')[0];
    if (seenImg.has(key)) return;
    seenImg.add(key);
    images.push({ url: u });
  });

  return {
    platform: info.key,
    platformName: info.name,
    videoId: `gen_${Buffer.from(target).toString('base64').slice(0, 20)}`,
    title: cleanTitle(meta.title),
    rawTitle: meta.title,
    cover: meta.cover,
    author: meta.author,
    authorAvatar: '',
    duration: meta.duration,
    durationText: durationText(meta.duration),
    qualities,
    images,
    proxyHeaders: {
      Referer: new URL(target).origin + '/',
      'User-Agent': UA.ios,
    },
  };
}

module.exports = { key: KEY, name: NAME, match, parse };
