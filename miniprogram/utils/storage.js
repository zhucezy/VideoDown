const { CONFIG } = require('./config');

const HISTORY_KEY = 'parse_history';

function getHistory() {
  try {
    const list = wx.getStorageSync(HISTORY_KEY);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

/** 新增一条记录，按 videoId/url 去重并置顶 */
function addHistory(item) {
  if (!item) return getHistory();
  const list = getHistory();
  const id = item.videoId || item.sourceUrl;
  const filtered = list.filter((v) => (v.videoId || v.sourceUrl) !== id);
  filtered.unshift(
    Object.assign({}, item, { savedAt: item.savedAt || Date.now() })
  );
  const next = filtered.slice(0, CONFIG.historyLimit);
  try {
    wx.setStorageSync(HISTORY_KEY, next);
  } catch (e) {}
  return next;
}

function removeHistory(id) {
  const next = getHistory().filter((v) => (v.videoId || v.sourceUrl) !== id);
  try {
    wx.setStorageSync(HISTORY_KEY, next);
  } catch (e) {}
  return next;
}

function clearHistory() {
  try {
    wx.removeStorageSync(HISTORY_KEY);
  } catch (e) {}
  return [];
}

module.exports = { getHistory, addHistory, removeHistory, clearHistory };
