const { getText, probe, UA } = require('../utils/http');
const {
  BizError,
  ERR,
  resolutionLabel,
  cleanTitle,
  durationText,
} = require('../utils/common');

const KEY = 'wxchannels';
const NAME = '微信视频号';

function match(url) {
  return /channels\.weixin\.qq\.com|finder\.video\.qq\.com|发现页.*视频号/.test(
    url
  );
}

/**
 * ⚠️ 关于视频号的技术现实（请务必阅读）
 *
 * 视频号没有任何公开的 Web 解析接口。它的媒体流：
 *   1. 走 finder.video.qq.com，地址形如 /251/20302/stodownload?encfilekey=...&token=...
 *   2. 视频内容本身是 AES-CBC 加密的，解密需要客户端在播放时下发的 decode_key
 *   3. encfilekey / token 有时效，且与请求方的登录态绑定
 *
 * 因此本解析器支持两种输入：
 *
 *   A) 直接粘贴 finder.video.qq.com 的完整直链（含 encfilekey & token）
 *      → 可以中转下载。若该视频未加密（大量公开号内容未加密）即可直接播放；
 *        若加密，需要额外提供 decode_key 才能还原。
 *
 *   B) 粘贴 channels.weixin.qq.com 分享页链接
 *      → 尝试从分享页 SSR 数据中提取 objectId / objectNonceId / 媒体信息。
 *        微信对该页面有严格的 UA 与登录态校验，服务端直连大概率拿不到数据，
 *        此时给出明确的操作指引，而不是含糊报错。
 */
async function parse(url) {
  // ===== 形态 A：finder 直链 =====
  if (/finder\.video\.qq\.com/.test(url)) {
    const { size, finalUrl } = await probe(url, {
      Referer: 'https://channels.weixin.qq.com/',
      'User-Agent': UA.wechat,
    });

    if (!size) {
      throw new BizError(
        ERR.NOT_FOUND,
        '该视频号直链已失效（encfilekey/token 过期），请重新复制'
      );
    }

    return {
      platform: KEY,
      platformName: NAME,
      videoId: `wxc_${Buffer.from(url).toString('base64').slice(0, 16)}`,
      title: '视频号作品',
      rawTitle: '',
      cover: '',
      author: '',
      authorAvatar: '',
      duration: 0,
      durationText: '',
      qualities: [
        {
          url: finalUrl,
          width: 0,
          height: 0,
          bitrate: 0,
          size,
          label: '原画',
          format: 'mp4',
        },
      ],
      images: [],
      proxyHeaders: {
        Referer: 'https://channels.weixin.qq.com/',
        'User-Agent': UA.wechat,
      },
      notice: '视频号内容可能经过加密，若保存后无法播放属于平台限制',
    };
  }

  // ===== 形态 B：分享页 =====
  let html = '';
  try {
    const r = await getText(url, {
      ua: UA.wechat,
      headers: { Referer: 'https://channels.weixin.qq.com/' },
    });
    html = r.text;
  } catch (e) {
    html = '';
  }

  // 分享页偶尔会把 objectId 与媒体信息内联出来
  const objectId = (html.match(/["']objectId["']\s*:\s*["']([^"']+)["']/) || [])[1];
  const mediaUrl = (html.match(
    /https?:\\?\/\\?\/finder\.video\.qq\.com[^"'\s]+/
  ) || [])[0];

  if (mediaUrl) {
    const clean = mediaUrl.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    const desc =
      (html.match(/["']desc["']\s*:\s*["']([^"']{0,200})["']/) || [])[1] || '';
    const nickname =
      (html.match(/["']nickname["']\s*:\s*["']([^"']{0,64})["']/) || [])[1] || '';
    const { size } = await probe(clean, {
      Referer: 'https://channels.weixin.qq.com/',
      'User-Agent': UA.wechat,
    });

    return {
      platform: KEY,
      platformName: NAME,
      videoId: `wxc_${objectId || Date.now()}`,
      title: cleanTitle(desc),
      rawTitle: desc,
      cover:
        (html.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
        ) || [])[1] || '',
      author: nickname,
      authorAvatar: '',
      duration: 0,
      durationText: '',
      qualities: [
        {
          url: clean,
          width: 0,
          height: 0,
          bitrate: 0,
          size,
          label: '原画',
          format: 'mp4',
        },
      ],
      images: [],
      proxyHeaders: {
        Referer: 'https://channels.weixin.qq.com/',
        'User-Agent': UA.wechat,
      },
    };
  }

  throw new BizError(
    ERR.UNSUPPORTED,
    '视频号分享页无法直接解析。请在电脑端微信打开该视频，' +
      '右键复制视频地址（finder.video.qq.com 开头）后再粘贴进来'
  );
}

module.exports = { key: KEY, name: NAME, match, parse };
