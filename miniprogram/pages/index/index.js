const { request } = require('../../utils/request');
const { extractFirstUrl, formatTime } = require('../../utils/url');
const { detectPlatform, getPlatform } = require('../../utils/platforms');
const { getHistory, addHistory } = require('../../utils/storage');
const { copyText } = require('../../utils/download');

Page({
  data: {
    input: '',
    focus: false,
    parsing: false,
    detected: null,
    result: null,
    errorMsg: '',
    errorTip: '',
    recent: [],
    steps: [
      { h: '复制链接', p: '在抖音/微博/小红书等 App 中点击分享 → 复制链接' },
      { h: '粘贴解析', p: '回到本页面点击「粘贴」，整段文案也能自动识别' },
      { h: '保存到相册', p: '选择最高清晰度，一键保存无水印原片' },
    ],
  },

  onLoad() {
    this.loadRecent();
  },

  onShow() {
    this.loadRecent();
    // 从后台切回时自动嗅探剪贴板中的分享链接
    this.sniffClipboard();
  },

  onShareAppMessage() {
    return {
      title: '一键解析无水印视频，支持抖音/微博/小红书',
      path: '/pages/index/index',
    };
  },

  onShareTimeline() {
    return { title: '一键解析无水印视频' };
  },

  loadRecent() {
    const list = getHistory()
      .slice(0, 3)
      .map((v) => Object.assign({}, v, { timeText: formatTime(v.savedAt) }));
    this.setData({ recent: list });
  },

  /**
   * 静默读取剪贴板：仅当内容是可识别的视频链接、且与上次不同才提示。
   * 说明：wx.getClipboardData 在真机会有系统提示，属于预期行为。
   */
  sniffClipboard() {
    if (this.data.parsing || this.data.input) return;
    wx.getClipboardData({
      success: (res) => {
        const text = res.data || '';
        const url = extractFirstUrl(text);
        if (!url) return;
        if (url === this.lastSniff) return;
        const plat = detectPlatform(url);
        if (!plat) return;

        this.lastSniff = url;
        wx.showModal({
          title: '检测到视频链接',
          content: `发现一条${plat.name}链接，是否立即解析？`,
          confirmText: '立即解析',
          cancelText: '忽略',
          confirmColor: '#2B6DF6',
          success: (m) => {
            if (!m.confirm) return;
            this.setData({ input: url, detected: plat });
            this.onParse();
          },
        });
      },
      fail: () => {},
    });
  },

  onInput(e) {
    const value = e.detail.value;
    this.setData({
      input: value,
      detected: detectPlatform(extractFirstUrl(value)),
      errorMsg: '',
    });
  },

  onFocus() {
    this.setData({ focus: true });
  },

  onBlur() {
    this.setData({ focus: false });
  },

  onClear() {
    this.setData({ input: '', detected: null, errorMsg: '', result: null });
  },

  onPaste() {
    wx.getClipboardData({
      success: (res) => {
        const text = res.data || '';
        if (!text.trim()) {
          wx.showToast({ title: '剪贴板是空的', icon: 'none' });
          return;
        }
        this.setData({
          input: text,
          detected: detectPlatform(extractFirstUrl(text)),
          errorMsg: '',
        });
        wx.vibrateShort({ type: 'light' });
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败', icon: 'none' }),
    });
  },

  onShowHelp() {
    wx.showModal({
      title: '如何获取链接',
      content:
        '抖音：点击右下角分享 → 复制链接\n' +
        '微博：视频右上角「…」→ 复制链接\n' +
        '小红书：分享 → 复制链接\n' +
        '视频号：右下角分享 → 复制链接\n' +
        '即梦：作品页分享 → 复制链接\n\n' +
        '整段带文字的分享口令也能直接粘贴。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#2B6DF6',
    });
  },

  /** 核心：调用服务端解析 */
  async onParse() {
    if (this.data.parsing) return;

    const url = extractFirstUrl(this.data.input);
    if (!url) {
      wx.showToast({ title: '没有识别到有效链接', icon: 'none' });
      return;
    }

    this.setData({
      parsing: true,
      result: null,
      errorMsg: '',
      errorTip: '',
    });

    try {
      const data = await request({
        url: '/api/parse',
        method: 'POST',
        data: { url },
        timeout: 25000,
      });

      const result = this.normalize(data, url);
      this.setData({ parsing: false, result });

      addHistory({
        videoId: result.videoId,
        sourceUrl: url,
        platform: result.platform,
        platformName: result.platformName,
        title: result.title,
        cover: result.cover,
        author: result.author,
        durationText: result.durationText,
        qualities: result.qualities,
        images: result.images,
        type: result.type,
        savedAt: Date.now(),
      });
      this.loadRecent();

      wx.vibrateShort({ type: 'medium' });
    } catch (err) {
      this.setData({
        parsing: false,
        errorMsg: (err && err.message) || '解析失败',
        errorTip: this.hintFor(err),
      });
    }
  },

  /** 把服务端返回统一成组件需要的结构，并保证清晰度按分辨率倒序 */
  normalize(data, sourceUrl) {
    const plat = getPlatform(data.platform);
    const qualities = (data.qualities || [])
      .filter((q) => q && q.url)
      .sort((a, b) => {
        // 优先按短边分辨率，其次按码率、体积
        const ra = (a.height || 0) * (a.width || 0);
        const rb = (b.height || 0) * (b.width || 0);
        if (rb !== ra) return rb - ra;
        if ((b.bitrate || 0) !== (a.bitrate || 0))
          return (b.bitrate || 0) - (a.bitrate || 0);
        return (b.size || 0) - (a.size || 0);
      });

    return {
      videoId: data.videoId || sourceUrl,
      sourceUrl,
      platform: data.platform,
      platformName: data.platformName || (plat && plat.name) || '未知平台',
      title: data.title || '',
      rawTitle: data.rawTitle || data.title || '',
      cover: data.cover || '',
      coverDownload: data.coverDownload || data.cover || '',
      author: data.author || '',
      authorAvatar: data.authorAvatar || '',
      duration: data.duration || 0,
      durationText: data.durationText || '',
      images: data.images || [],
      qualities,
      type: qualities.length && data.images && data.images.length
        ? 'mixed'
        : data.images && data.images.length
        ? 'image'
        : 'video',
    };
  },

  hintFor(err) {
    const code = err && err.code;
    if (code === 4001) return '链接格式不正确，请复制完整的分享链接';
    if (code === 4004) return '该内容可能已删除、设为私密或需要登录查看';
    if (code === 4029) return '当前解析人数较多，请稍后再试';
    if (code === 4090) return '该平台的这类内容暂不支持，欢迎在「我的」页反馈';
    return '可尝试重新复制链接，或换一条内容试试';
  },

  onSaved() {
    // 保存成功后的埋点位置（可接入自定义分析）
  },

  onPreview(e) {
    const { url } = e.detail;
    if (!url) return;
    // 小程序无内置全屏播放器 API，这里给出直链复制兜底
    wx.showActionSheet({
      itemList: ['复制视频直链'],
      success: () => copyText(url, '直链已复制，可粘贴到浏览器打开'),
      fail: () => {},
    });
  },

  onRecentTap(e) {
    const item = this.data.recent[e.currentTarget.dataset.index];
    if (!item) return;
    this.setData({
      input: item.sourceUrl,
      detected: getPlatform(item.platform),
    });
    this.onParse();
  },

  goHistory() {
    wx.switchTab({ url: '/pages/history/history' });
  },

  onAdState(e) {
    // 广告加载状态：可用于统计填充率
    const { state } = e.detail || {};
    if (state === 'error') {
      // 无填充时不做任何提示，容器已自动收起
    }
  },
});
