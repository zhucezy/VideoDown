const { req, getText, getJson, resolveRedirect, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
} = require('../utils/common');
const config = require('../config');

const KEY = 'weibo';
const NAME = '微博';

function match(url) {
  return /weibo\.com|weibo\.cn|t\.cn/.test(url);
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

/** 形态一：微博正文（含视频）→ m.weibo.cn/statuses/show */
async function parseStatus(id) {
  const api = `https://m.weibo.cn/statuses/show?id=${id}`;
  const json = await getJson(api, {
    ua: UA.ios,
    headers: {
      Referer: `https://m.weibo.cn/detail/${id}`,
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: config.cookies.weibo || '',
    },
  });

  if (!json || !json.data) {
    throw new BizError(ERR.NOT_FOUND, '微博不存在、已删除或需要登录查看');
  }

  const d = json.data;
  const pageInfo = d.page_info || {};
  const media = pageInfo.media_info || {};
  const qualities = [];

  // playback_list 给出多档清晰度，是最完整的来源
  const list = Array.isArray(media.playback_list) ? media.playback_list : [];
  list.forEach((item) => {
    const info = item.play_info || {};
    if (!info.url) return;
    qualities.push({
      url: info.url,
      width: info.width || 0,
      height: info.height || 0,
      bitrate: info.bitrate || 0,
      size: info.size || 0,
      label: resolutionLabel(info.width, info.height, info.quality_desc),
      format: 'mp4',
    });
  });

  // 兜底字段（老数据结构）
  if (!qualities.length) {
    const fallbacks = [
      { u: media.mp4_1080p_mp4, label: '1080P', h: 1080 },
      { u: media.mp4_720p_mp4, label: '720P', h: 720 },
      { u: media.mp4_hd_url, label: '高清', h: 540 },
      { u: media.mp4_sd_url, label: '标清', h: 360 },
      { u: media.stream_url_hd, label: '高清', h: 540 },
      { u: media.stream_url, label: '标清', h: 360 },
    ];
    fallbacks.forEach((f) => {
      if (f.u) {
        qualities.push({
          url: f.u,
          width: 0,
          height: f.h,
          bitrate: 0,
          size: 0,
          label: f.label,
          format: 'mp4',
        });
      }
    });
  }

  // 图集（九宫格原图）
  const images = [];
  const pics = d.pics || [];
  pics.forEach((p) => {
    const u = (p.large && p.large.url) || p.url;
    if (u) images.push({ url: u });
  });

  if (!qualities.length && !images.length) {
    throw new BizError(ERR.NOT_FOUND, '这条微博里没有可下载的视频或图片');
  }

  const user = d.user || {};
  const dur = media.duration || pageInfo.media_info.duration || 0;

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `wb_${d.id || id}`,
    title: cleanTitle(stripHtml(d.text)),
    rawTitle: stripHtml(d.text),
    cover: pageInfo.page_pic || (d.pics && d.pics[0] && d.pics[0].url) || '',
    author: user.screen_name || '',
    authorAvatar: user.profile_image_url || '',
    duration: Math.round(dur),
    durationText: durationText(dur),
    qualities,
    images,
    proxyHeaders: {
      Referer: 'https://weibo.com/',
      'User-Agent': UA.ios,
    },
  };
}

/** 形态二：微博视频号 weibo.com/tv/show/1034:xxxx */
async function parseTv(fid) {
  const api = 'https://h5.video.weibo.com/api/component?page=%2Fshow%2F' + encodeURIComponent(fid);
  const body = `data=${encodeURIComponent(
    JSON.stringify({ Component_Play_Playinfo: { oid: fid } })
  )}`;

  const res = await req(api, {
    method: 'POST',
    ua: UA.pc,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: `https://h5.video.weibo.com/show/${fid}`,
      Cookie: config.cookies.weibo || 'SUB=_2A;',
    },
    body,
  });

  const json = await res.json().catch(() => null);
  const info =
    json && json.data && json.data.Component_Play_Playinfo
      ? json.data.Component_Play_Playinfo
      : null;

  if (!info || !info.urls) {
    throw new BizError(ERR.NOT_FOUND, '未获取到微博视频信息，可能需要登录');
  }

  // urls 形如 { "超清 1080P": "//f.video.weibocdn.com/...", "高清 720P": "..." }
  const qualities = Object.keys(info.urls).map((label) => {
    const raw = info.urls[label];
    const u = raw.startsWith('http') ? raw : `https:${raw}`;
    const m = label.match(/(\d{3,4})P/i);
    const h = m ? Number(m[1]) : 0;
    return {
      url: u,
      width: 0,
      height: h,
      bitrate: 0,
      size: 0,
      label: label.replace(/\s+/g, ' ').trim(),
      format: 'mp4',
    };
  });

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `wb_${fid}`,
    title: cleanTitle(info.title),
    rawTitle: info.title || '',
    cover: info.cover_image
      ? info.cover_image.startsWith('http')
        ? info.cover_image
        : `https:${info.cover_image}`
      : '',
    author: info.author || '',
    authorAvatar: '',
    duration: Math.round(info.duration || 0),
    durationText: durationText(info.duration),
    qualities,
    images: [],
    proxyHeaders: {
      Referer: 'https://weibo.com/',
      'User-Agent': UA.pc,
    },
  };
}

async function parse(url) {
  let target = url;

  if (/t\.cn/.test(url)) {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
    target = finalUrl;
  }

  // 视频号形态
  const tv = target.match(/(?:tv\/show|show\?fid=|\/show\/)(1034:[a-z0-9]+)/i);
  if (tv) return parseTv(tv[1]);

  // 正文形态：/detail/{id}、/status/{id}、/u/xxx/{bid}
  const idMatch =
    target.match(/(?:detail|status)\/(\w+)/i) ||
    target.match(/weibo\.(?:com|cn)\/\d+\/(\w+)/i);
  if (idMatch) return parseStatus(idMatch[1]);

  throw new BizError(ERR.BAD_URL, '未识别的微博链接格式');
}

module.exports = { key: KEY, name: NAME, match, parse };
