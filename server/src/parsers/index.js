const douyin = require('./douyin');
const weibo = require('./weibo');
const xiaohongshu = require('./xiaohongshu');
const wxchannels = require('./wxchannels');
const jimeng = require('./jimeng');
const kuaishou = require('./kuaishou');
const bilibili = require('./bilibili');
const generic = require('./generic');

/**
 * 注册顺序 = 匹配优先级。
 * generic 是兜底解析器（match 恒为 true），必须排在最后。
 */
const PARSERS = [
  douyin,
  weibo,
  xiaohongshu,
  wxchannels,
  jimeng,
  kuaishou,
  bilibili,
  generic,
];

function resolveParser(url) {
  return PARSERS.find((p) => {
    try {
      return p.match(url);
    } catch (e) {
      return false;
    }
  });
}

/** 对外暴露的平台清单，小程序可通过 /api/platforms 拉取 */
function listPlatforms() {
  return PARSERS.filter((p) => p.key !== 'generic').map((p) => ({
    key: p.key,
    name: p.name,
  }));
}

module.exports = { PARSERS, resolveParser, listPlatforms };
