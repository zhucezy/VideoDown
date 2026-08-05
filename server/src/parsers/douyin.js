const { req, getText, resolveRedirect, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
  safeJsonParse,
} = require('../utils/common');
const config = require('../config');

const KEY = 'douyin';
const NAME = '抖音';

const HOSTS = ['douyin.com', 'iesdouyin.com', 'douyinvod.com'];

function match(url) {
  return HOSTS.some((h) => url.includes(h));
}

/** 从各种形态的抖音链接里抠出 aweme_id */
async function resolveAwemeId(url) {
  let target = url;

  // v.douyin.com / www.iesdouyin.com/share 短链需要先展开
  if (/v\.douyin\.com|douyin\.com\/[a-zA-Z0-9]{6,}\/?$/.test(url)) {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
    target = finalUrl;
  }

  const patterns = [
    /video\/(\d{15,})/,
    /note\/(\d{15,})/,
    /modal_id=(\d{15,})/,
    /aweme_id=(\d{15,})/,
    /\/(\d{15,})/,
  ];
  for (const re of patterns) {
    const m = target.match(re);
    if (m) return { awemeId: m[1], finalUrl: target };
  }
  throw new BizError(ERR.BAD_URL, '未能从链接中识别抖音作品 ID');
}

/**
 * 抖音分享页里挂着完整的作品 JSON（window._ROUTER_DATA）。
 * 比直接打接口稳定，接口签名策略变动频繁。
 */
async function fetchDetail(awemeId) {
  const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/`;
  const { text } = await getText(shareUrl, {
    ua: UA.ios,
    headers: {
      Referer: 'https://www.douyin.com/',
      Cookie: config.cookies.douyin || '',
    },
  });

  const m = text.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
  if (!m) {
    throw new BizError(
      ERR.NOT_FOUND,
      '抖音页面结构已变化或作品不可见，请确认链接有效'
    );
  }

  const data = safeJsonParse(m[1]);
  const loader = (data && data.loaderData) || {};
  // key 形如 video_(id)/page 或 note_(id)/page，直接找第一个带 videoInfoRes 的
  const pageKey = Object.keys(loader).find(
    (k) => loader[k] && loader[k].videoInfoRes
  );
  if (!pageKey) throw new BizError(ERR.NOT_FOUND, '未获取到作品信息');

  const list = loader[pageKey].videoInfoRes.item_list || [];
  if (!list.length) {
    const filter = loader[pageKey].videoInfoRes.filter_list || [];
    const reason = filter[0] && (filter[0].detail_msg || filter[0].notice);
    throw new BizError(ERR.NOT_FOUND, reason || '作品已删除或不可见');
  }
  return list[0];
}

/** 去水印核心：把 playwm 换成 play，并跟随 302 拿到真实 mp4 */
function dewatermark(url) {
  return String(url || '')
    .replace('/playwm/', '/play/')
    .replace('playwm', 'play')
    .replace('watermark=1', 'watermark=0');
}

async function parse(url) {
  const { awemeId } = await resolveAwemeId(url);
  const item = await fetchDetail(awemeId);

  const video = item.video || {};
  const cover =
    (video.cover && video.cover.url_list && video.cover.url_list[0]) ||
    (video.origin_cover &&
      video.origin_cover.url_list &&
      video.origin_cover.url_list[0]) ||
    '';

  const qualities = [];

  // 1) bit_rate 数组里是各档位的原画流，画质信息最全
  const bitRates = Array.isArray(video.bit_rate) ? video.bit_rate : [];
  bitRates.forEach((br) => {
    const pa = br.play_addr || {};
    const u = (pa.url_list || []).find((x) => x);
    if (!u) return;
    qualities.push({
      url: dewatermark(u),
      width: pa.width || video.width || 0,
      height: pa.height || video.height || 0,
      bitrate: br.bit_rate || 0,
      size: pa.data_size || 0,
      label: resolutionLabel(pa.width, pa.height, br.gear_name),
      format: br.format || 'mp4',
    });
  });

  // 2) 兜底：play_addr（通常是默认档）
  if (!qualities.length) {
    const pa = video.play_addr || {};
    const u = (pa.url_list || []).find((x) => x);
    if (u) {
      qualities.push({
        url: dewatermark(u),
        width: pa.width || video.width || 0,
        height: pa.height || video.height || 0,
        bitrate: 0,
        size: pa.data_size || 0,
        label: resolutionLabel(pa.width, pa.height, '原画'),
        format: 'mp4',
      });
    }
  }

  // 3) 图文笔记
  const images = [];
  if (Array.isArray(item.images)) {
    item.images.forEach((img) => {
      const u = (img.url_list || []).find((x) => x);
      if (u) images.push({ url: u, width: img.width, height: img.height });
    });
  }

  if (!qualities.length && !images.length) {
    throw new BizError(ERR.NOT_FOUND, '该作品没有可下载的视频或图片');
  }

  const author = item.author || {};

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `dy_${awemeId}`,
    title: cleanTitle(item.desc),
    rawTitle: item.desc || '',
    cover,
    author: author.nickname || '',
    authorAvatar:
      (author.avatar_thumb &&
        author.avatar_thumb.url_list &&
        author.avatar_thumb.url_list[0]) ||
      '',
    duration: Math.round((video.duration || item.duration || 0) / 1000),
    durationText: durationText((video.duration || item.duration || 0) / 1000),
    qualities,
    images,
    // 抖音 CDN 对 Referer 不敏感，但带上更稳
    proxyHeaders: {
      Referer: 'https://www.douyin.com/',
      'User-Agent': UA.ios,
    },
  };
}

module.exports = { key: KEY, name: NAME, match, parse };
