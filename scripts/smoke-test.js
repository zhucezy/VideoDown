/**
 * 服务端冒烟测试（不依赖 express）
 * 校验：平台路由命中、签名生成/校验、工具函数、清晰度排序
 * 运行: node scripts/smoke-test.js
 */
process.env.SIGN_SECRET = 'test-secret-for-smoke';
process.env.PUBLIC_BASE = 'https://api.example.com';

const path = require('path');
const SRC = path.join(__dirname, '..', 'server', 'src');

const { resolveParser, listPlatforms } = require(path.join(SRC, 'parsers'));
const { buildProxyUrl, verifyProxy } = require(path.join(SRC, 'utils', 'sign'));
const common = require(path.join(SRC, 'utils', 'common'));

let pass = 0;
let fail = 0;

function ok(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${extra ? '  → ' + extra : ''}`);
  }
}

console.log('\n[1] 平台路由命中');
const routeCases = [
  ['https://v.douyin.com/iRxYqLpQ/', 'douyin'],
  ['https://www.douyin.com/video/7300000000000000000', 'douyin'],
  ['https://m.weibo.cn/detail/4900000000000000', 'weibo'],
  ['https://weibo.com/tv/show/1034:abcdef123456', 'weibo'],
  ['https://www.xiaohongshu.com/explore/65a1b2c3d4e5f60001020304', 'xiaohongshu'],
  ['http://xhslink.com/a/AbCdEf', 'xiaohongshu'],
  ['https://channels.weixin.qq.com/share?xxx', 'wxchannels'],
  ['https://finder.video.qq.com/251/20302/stodownload?encfilekey=x', 'wxchannels'],
  ['https://jimeng.jianying.com/ai-tool/video/detail?id=abc123', 'jimeng'],
  ['https://dreamina.capcut.com/works/xxx', 'jimeng'],
  ['https://v.kuaishou.com/AbCdEf', 'kuaishou'],
  ['https://www.bilibili.com/video/BV1xx411c7mD', 'bilibili'],
  ['https://b23.tv/AbCdEf', 'bilibili'],
  ['https://h5.pipix.com/s/abcdef/', 'generic'],
  ['https://www.ixigua.com/700000000000', 'generic'],
  ['https://example.com/some/video', 'generic'],
];
routeCases.forEach(([url, expect]) => {
  const p = resolveParser(url);
  ok(`${expect.padEnd(12)} ← ${url.slice(0, 52)}`, p && p.key === expect,
    p ? `实际命中 ${p.key}` : '无命中');
});

console.log('\n[2] 代理签名');
const target = 'https://aweme.snssdk.com/aweme/v1/play/?video_id=v0300&ratio=1080p';
const proxied = buildProxyUrl(target, { platform: 'douyin', filename: '测试视频.mp4' });
ok('生成的链接指向 PUBLIC_BASE', proxied.startsWith('https://api.example.com/api/dl?'));

const q = Object.fromEntries(new URL(proxied).searchParams.entries());
const v = verifyProxy(q);
ok('签名校验通过', v.ok, v.reason);
ok('还原出的原始地址一致', v.url === target, v.url);
ok('平台标识透传', v.platform === 'douyin');

const tampered = Object.assign({}, q, { u: q.u.slice(0, -2) + 'AA' });
ok('篡改地址后校验失败', !verifyProxy(tampered).ok);

const expired = Object.assign({}, q, { e: '1000000000' });
ok('过期链接校验失败', !verifyProxy(expired).ok);

console.log('\n[3] 清晰度排序（必须最高画质在前）');
const sorted = common.sortQualities([
  { url: 'a', width: 720, height: 1280, bitrate: 1500000 },
  { url: 'b', width: 1080, height: 1920, bitrate: 3000000 },
  { url: 'c', width: 540, height: 960, bitrate: 800000 },
  { url: 'd', width: 1080, height: 1920, bitrate: 5000000 },
  { url: 'e', width: 0, height: 0 },
]);
ok('首项为最高码率的 1080P', sorted[0].url === 'd', JSON.stringify(sorted[0]));
ok('次项为另一档 1080P', sorted[1].url === 'b');
ok('末项为无分辨率信息项', sorted[sorted.length - 1].url === 'e');

console.log('\n[4] 工具函数');
ok('从分享口令提取链接',
  common.pickUrl('7.65 复制打开抖音，看看【某某】 https://v.douyin.com/iRxYq/ 复制此链接')
    === 'https://v.douyin.com/iRxYq/');
ok('剥离中文尾标点',
  common.pickUrl('看看这个 https://xhslink.com/a/AbCd，很不错') === 'https://xhslink.com/a/AbCd');
ok('分辨率标签 1080P', common.resolutionLabel(1080, 1920) === '1080P');
ok('分辨率标签 4K', common.resolutionLabel(2160, 3840) === '4K');
ok('体积格式化', common.sizeText(15728640) === '15.0MB', common.sizeText(15728640));
ok('时长格式化', common.durationText(125) === '2:05');
ok('标题清洗去话题', common.cleanTitle('好看的风景 #旅行 #vlog @小明') === '好看的风景');
ok('容错解析含 undefined 的 JS 字面量',
  JSON.stringify(common.safeJsonParse('{"a":undefined,"b":1}')) === '{"a":null,"b":1}');

console.log('\n[5] 平台清单');
const plats = listPlatforms();
ok('已注册 7 个具名平台', plats.length === 7, `实际 ${plats.length}`);
ok('清单不含兜底解析器', !plats.some((p) => p.key === 'generic'));
console.log('    ' + plats.map((p) => p.name).join('、'));

console.log(`\n${'='.repeat(46)}`);
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
console.log('='.repeat(46) + '\n');
process.exit(fail ? 1 : 0);
