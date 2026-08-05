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

const KEY = 'xiaohongshu';
const NAME = '小红书';

function match(url) {
  return /xiaohongshu\.com|xhslink\.com/.test(url);
}

/**
 * 小红书笔记页把完整数据挂在 window.__INITIAL_STATE__ 上。
 * 注意：这段是 JS 字面量，里面会出现裸 undefined，必须替换后才能 JSON.parse。
 */
function extractState(html) {
  const m = html.match(
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/
  );
  if (!m) return null;
  return safeJsonParse(m[1]);
}

async function parse(url) {
  let target = url;

  // xhslink 短链需要展开，展开后的地址带 xsec_token，缺了会 404
  if (/xhslink\.com/.test(url)) {
    const { finalUrl } = await resolveRedirect(url, { ua: UA.ios });
    target = finalUrl;
  }

  const idMatch = target.match(
    /(?:explore|discovery\/item|item)\/([0-9a-f]{24})/i
  );
  if (!idMatch) {
    throw new BizError(ERR.BAD_URL, '未能识别小红书笔记 ID');
  }
  const noteId = idMatch[1];

  const { text: html } = await getText(target, {
    ua: UA.ios,
    headers: {
      Referer: 'https://www.xiaohongshu.com/',
      Cookie: config.cookies.xiaohongshu || '',
    },
  });

  const state = extractState(html);
  const noteMap =
    state && state.note && state.note.noteDetailMap
      ? state.note.noteDetailMap
      : null;

  if (!noteMap) {
    throw new BizError(
      ERR.NOT_FOUND,
      '笔记不可见或触发了风控，可稍后重试 / 配置登录 Cookie'
    );
  }

  const entry = noteMap[noteId] || noteMap[Object.keys(noteMap)[0]];
  const note = entry && entry.note;
  if (!note) throw new BizError(ERR.NOT_FOUND, '笔记已删除或设为私密');

  const qualities = [];
  const video = note.video;

  if (video && video.media && video.media.stream) {
    const stream = video.media.stream;
    // 依次尝试 h264 / h265 / av1，同一档位可能给多个备用域名
    ['h264', 'h265', 'h266', 'av1'].forEach((codec) => {
      const arr = stream[codec];
      if (!Array.isArray(arr)) return;
      arr.forEach((s) => {
        const u = s.masterUrl || (s.backupUrls && s.backupUrls[0]);
        if (!u) return;
        qualities.push({
          url: u,
          width: s.width || 0,
          height: s.height || 0,
          bitrate: s.videoBitrate || 0,
          size: s.size || 0,
          label: `${resolutionLabel(s.width, s.height, s.qualityType)}${
            codec === 'h264' ? '' : ` ${codec.toUpperCase()}`
          }`,
          format: s.format || 'mp4',
        });
      });
    });
  }

  // 兜底：用 originVideoKey 直接拼 CDN 地址（这是最原始的无水印源）
  if (!qualities.length && video && video.consumer && video.consumer.originVideoKey) {
    qualities.push({
      url: `https://sns-video-bd.xhscdn.com/${video.consumer.originVideoKey}`,
      width: (video.image && video.image.width) || 0,
      height: (video.image && video.image.height) || 0,
      bitrate: 0,
      size: 0,
      label: '原画',
      format: 'mp4',
    });
  }

  // 图文笔记：取无水印原图
  const images = [];
  (note.imageList || []).forEach((img) => {
    // urlDefault 带压缩参数，用 traceId 拼原图更清晰
    let u = img.urlDefault || img.url || '';
    if (img.traceId) {
      u = `https://sns-img-qc.xhscdn.com/${img.traceId}?imageView2/2/w/0/format/png`;
    }
    if (u) images.push({ url: u, width: img.width, height: img.height });
  });

  if (!qualities.length && !images.length) {
    throw new BizError(ERR.NOT_FOUND, '这条笔记没有可下载的内容');
  }

  const user = note.user || {};
  const dur = (video && video.capa && video.capa.duration) || 0;

  return {
    platform: KEY,
    platformName: NAME,
    videoId: `xhs_${noteId}`,
    title: cleanTitle(note.title || note.desc),
    rawTitle: `${note.title || ''}\n${note.desc || ''}`.trim(),
    cover:
      (note.imageList && note.imageList[0] && note.imageList[0].urlDefault) || '',
    author: user.nickname || '',
    authorAvatar: user.avatar || '',
    duration: dur,
    durationText: durationText(dur),
    qualities,
    images,
    // 小红书 CDN 有 Referer 校验，代理时必须带上
    proxyHeaders: {
      Referer: 'https://www.xiaohongshu.com/',
      'User-Agent': UA.ios,
    },
  };
}

module.exports = { key: KEY, name: NAME, match, parse };
