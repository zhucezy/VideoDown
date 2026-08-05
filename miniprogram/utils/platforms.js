/**
 * 平台元信息：用于首页图标墙、结果卡片标签、以及本地预判断链接归属。
 * key 需与服务端 parsers 的 key 保持一致。
 */
const PLATFORMS = [
  {
    key: 'douyin',
    name: '抖音',
    color: '#111114',
    letter: '抖',
    hosts: ['douyin.com', 'iesdouyin.com', 'v.douyin.com'],
    supported: true,
  },
  {
    key: 'weibo',
    name: '微博',
    color: '#E6162D',
    letter: '微',
    hosts: ['weibo.com', 'weibo.cn', 'video.weibo.com', 't.cn'],
    supported: true,
  },
  {
    key: 'xiaohongshu',
    name: '小红书',
    color: '#FF2442',
    letter: '书',
    hosts: ['xiaohongshu.com', 'xhslink.com'],
    supported: true,
  },
  {
    key: 'wxchannels',
    name: '微信视频号',
    color: '#07C160',
    letter: '视',
    hosts: ['channels.weixin.qq.com', 'finder.video.qq.com'],
    supported: true,
    tip: '需从视频号「复制链接」获取，部分内容受版权保护无法解析',
  },
  {
    key: 'jimeng',
    name: '即梦',
    color: '#5B4CFF',
    letter: '即',
    hosts: ['jimeng.jianying.com', 'dreamina.capcut.com'],
    supported: true,
  },
  {
    key: 'kuaishou',
    name: '快手',
    color: '#FF4906',
    letter: '快',
    hosts: ['kuaishou.com', 'gifshow.com', 'chenzhongtech.com'],
    supported: true,
  },
  {
    key: 'bilibili',
    name: '哔哩哔哩',
    color: '#FB7299',
    letter: 'B',
    hosts: ['bilibili.com', 'b23.tv'],
    supported: true,
  },
  {
    key: 'pipixia',
    name: '皮皮虾',
    color: '#FFC300',
    letter: '皮',
    hosts: ['pipix.com', 'h5.pipix.com'],
    supported: true,
  },
  {
    key: 'xigua',
    name: '西瓜视频',
    color: '#FF6F00',
    letter: '西',
    hosts: ['ixigua.com'],
    supported: true,
  },
  {
    key: 'zhihu',
    name: '知乎',
    color: '#0B84FF',
    letter: '知',
    hosts: ['zhihu.com', 'zhuanlan.zhihu.com'],
    supported: true,
  },
  {
    key: 'weishi',
    name: '微视',
    color: '#FFCC00',
    letter: '视',
    hosts: ['weishi.qq.com', 'isee.weishi.qq.com'],
    supported: true,
  },
  {
    key: 'more',
    name: '更多',
    color: '#8A93A0',
    letter: '+',
    hosts: [],
    supported: true,
    tip: '支持 30+ 平台，直接粘贴链接试试',
  },
];

const HOST_INDEX = (() => {
  const map = [];
  PLATFORMS.forEach((p) => {
    p.hosts.forEach((h) => map.push({ host: h, key: p.key, name: p.name }));
  });
  // 长域名优先匹配，避免 weibo.com 抢先命中 video.weibo.com
  return map.sort((a, b) => b.host.length - a.host.length);
})();

/** 根据链接本地预判平台（仅用于 UI 提示，最终以服务端识别为准） */
function detectPlatform(url) {
  if (!url) return null;
  const lower = String(url).toLowerCase();
  const hit = HOST_INDEX.find((item) => lower.indexOf(item.host) > -1);
  if (!hit) return null;
  return PLATFORMS.find((p) => p.key === hit.key) || null;
}

function getPlatform(key) {
  return PLATFORMS.find((p) => p.key === key) || null;
}

module.exports = { PLATFORMS, detectPlatform, getPlatform };
