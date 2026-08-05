const { getJson, resolveRedirect, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
} = require('../utils/common');
const config = require('../config');

const KEY = 'bilibili';
const NAME = '哔哩哔哩';

function match(url) {
  return /bilibili\.com|b23\.tv|acg\.tv/.test(url);
}

/**
 * 清晰度码表（qn）
 * 注意：1080P+ / 4K 需要登录甚至大会员，未配置 Cookie 时最高到 1080P（qn=80）
 */
const QN_MAP = {
  127: { label: '8K', height: 4320 },
  120: { label: '4K', height: 2160 },
  116: { label: '1080P60', height: 1080 },
  112: { label: '1080P+', height: 1080 },
  80: { label: '1080P', height: 1080 },
  64: { label: '720P', height: 720 },
  32: { label: '480P', height: 480 },
  16: { label: '360P', height: 360 },
};

async function parse(url) {
  let target = url;
  if (/b23\.tv|acg\.tv/.test(url)) {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
    target = finalUrl;
  }

  const bv = target.match(/(BV[0-9A-Za-z]{10})/);
  const av = target.match(/\/av(\d+)/i);
  if (!bv && !av) throw new BizError(ERR.BAD_URL, '未识别到 BV / AV 号');

  const idQuery = bv ? `bvid=${bv[1]}` : `aid=${av[1]}`;
  const headers = {
    Referer: 'https://www.bilibili.com/',
    Cookie: config.cookies.bilibili || '',
  };

  const view = await getJson(
    `https://api.bilibili.com/x/web-interface/view?${idQuery}`,
    { ua: UA.pc, headers }
  );

  if (view.code !== 0 || !view.data) {
    throw new BizError(ERR.NOT_FOUND, view.message || '视频不存在或已下架');
  }

  const info = view.data;
  const cid = info.cid || (info.pages && info.pages[0] && info.pages[0].cid);
  if (!cid) throw new BizError(ERR.NOT_FOUND, '未获取到分P信息');

  const qualities = [];

  /**
   * 用 platform=html5 请求，返回的是可直接播放的完整 MP4（durl），
   * 不需要像 DASH 那样把音视频流合并——小程序端没有合流能力。
   * 代价是未登录时上限为 720P/1080P。
   */
  const tryQn = [120, 116, 80, 64, 32];
  for (const qn of tryQn) {
    try {
      const play = await getJson(
        `https://api.bilibili.com/x/player/playurl?${idQuery}&cid=${cid}` +
          `&qn=${qn}&fnval=0&fnver=0&fourk=1&platform=html5&high_quality=1`,
        { ua: UA.pc, headers }
      );
      if (play.code !== 0 || !play.data) continue;
      const durl = play.data.durl || [];
      if (!durl.length || !durl[0].url) continue;

      const realQn = play.data.quality || qn;
      const meta = QN_MAP[realQn] || { label: `${realQn}`, height: 0 };

      qualities.push({
        url: durl[0].url,
        width: 0,
        height: meta.height,
        bitrate: 0,
        size: durl[0].size || 0,
        label: meta.label,
        format: 'mp4',
      });

      // 已经拿到当前账号权限下的最高档，不必再往下试
      if (realQn >= qn) break;
    } catch (e) {
      // 单档失败继续尝试下一档
    }
  }

  if (!qualities.length) {
    throw new BizError(ERR.UPSTREAM, 'B站播放地址获取失败，可能需要登录 Cookie');
  }

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `bili_${info.bvid || info.aid}`,
    title: cleanTitle(info.title),
    rawTitle: info.title || '',
    cover: info.pic || '',
    author: (info.owner && info.owner.name) || '',
    authorAvatar: (info.owner && info.owner.face) || '',
    duration: info.duration || 0,
    durationText: durationText(info.duration),
    qualities,
    images: [],
    // B站 CDN 强制校验 Referer，必须由服务端代理带上
    proxyHeaders: {
      Referer: 'https://www.bilibili.com/',
      'User-Agent': UA.pc,
    },
  };
}

module.exports = { key: KEY, name: NAME, match, parse };
