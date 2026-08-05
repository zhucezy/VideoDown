const {
  getHistory,
  removeHistory,
  clearHistory,
} = require('../../utils/storage');
const { formatTime } = require('../../utils/url');
const { getPlatform } = require('../../utils/platforms');
const { copyText } = require('../../utils/download');

Page({
  data: {
    list: [],
  },

  onShow() {
    this.load();
  },

  load() {
    const list = getHistory().map((v) => {
      const p = getPlatform(v.platform);
      const best = (v.qualities && v.qualities[0]) || null;
      const type = v.type || (v.qualities && v.qualities.length
        ? v.images && v.images.length
          ? 'mixed'
          : 'video'
        : 'image');
      const typeLabel =
        type === 'mixed' ? '图文' : type === 'image' ? '图片' : '视频';
      const imgCount = (v.images && v.images.length) || 0;
      return Object.assign({}, v, {
        timeText: formatTime(v.savedAt),
        platColor: (p && p.color) || '#5B6270',
        bestLabel: best ? best.label : '',
        typeLabel,
        imgCount,
      });
    });
    this.setData({ list });
  },

  onReparse(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    // 记录里的直链有时效，回首页重新解析
    wx.setStorageSync('pending_url', item.sourceUrl);
    wx.switchTab({
      url: '/pages/index/index',
      success: () => {
        const pages = getCurrentPages();
        const index = pages[pages.length - 1];
        if (index && index.setData) {
          index.setData({
            input: item.sourceUrl,
            detected: getPlatform(item.platform),
          });
          if (index.onParse) index.onParse();
        }
      },
    });
  },

  onCopy(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    copyText(item.sourceUrl, '原链接已复制');
  },

  onRemove(e) {
    const item = this.data.list[e.currentTarget.dataset.index];
    if (!item) return;
    wx.showModal({
      title: '删除记录',
      content: '仅删除本地记录，不影响已保存到相册的视频',
      confirmColor: '#F5483B',
      success: (m) => {
        if (!m.confirm) return;
        removeHistory(item.videoId || item.sourceUrl);
        this.load();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  onClear() {
    wx.showModal({
      title: '清空全部记录',
      content: '此操作不可撤销，已保存到相册的视频不受影响',
      confirmColor: '#F5483B',
      success: (m) => {
        if (!m.confirm) return;
        clearHistory();
        this.load();
        wx.showToast({ title: '已清空', icon: 'none' });
      },
    });
  },

  goIndex() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
