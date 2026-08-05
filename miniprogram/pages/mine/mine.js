const { getHistory } = require('../../utils/storage');
const { copyText } = require('../../utils/download');

Page({
  data: {
    version: '1.0.0',
    stat: { total: 0, platforms: 0, today: 0 },
    menus: [
      {
        key: 'guide',
        icon: '指',
        title: '使用教程',
        desc: '各平台链接获取方式',
        bg: 'rgba(43,109,246,0.08)',
        color: '#2B6DF6',
      },
      {
        key: 'feedback',
        icon: '反',
        title: '问题反馈',
        desc: '解析失败 / 想支持新平台',
        bg: 'rgba(18,183,106,0.1)',
        color: '#12B76A',
      },
      {
        key: 'clearCache',
        icon: '清',
        title: '清理缓存',
        desc: '清除临时文件与本地记录',
        bg: 'rgba(255,138,61,0.12)',
        color: '#FF8A3D',
      },
      {
        key: 'about',
        icon: '关',
        title: '关于我们',
        desc: '服务条款与隐私政策',
        bg: 'rgba(138,147,160,0.12)',
        color: '#5B6270',
      },
    ],
    faqs: [
      {
        q: '为什么有的视频解析不出来？',
        a: '常见原因：内容被作者删除或设为私密、需要登录才能查看、平台近期调整了接口。可以先换一条链接试试，或通过「问题反馈」把链接发给我们。',
        open: false,
      },
      {
        q: '保存下来的还是有水印？',
        a: '本工具获取的是平台服务器上的原始视频流，通常不带平台水印。但如果作者在剪辑时自己压制了水印或片尾，这部分属于视频画面内容，技术上无法去除。',
        open: false,
      },
      {
        q: '为什么下载速度慢？',
        a: '视频从原平台 CDN 中转获取，速度受源站限速与你的网络影响。大文件建议在 Wi-Fi 下载，或选择稍低一档的清晰度。',
        open: false,
      },
      {
        q: '默认下载的是最高清晰度吗？',
        a: '是。解析结果按分辨率与码率从高到低排序，默认选中第一项即平台提供的最高画质；如果需要节省流量，可以手动切换到较低档位。',
        open: false,
      },
      {
        q: '视频保存到哪里了？',
        a: '保存成功后会写入手机系统相册，在「相册 / 图库」的视频分类中即可看到。',
        open: false,
      },
    ],
    notices: [
      '本工具仅供个人学习、研究与素材备份使用。',
      '解析内容的著作权归原作者所有，请勿用于商业用途或二次分发。',
      '请遵守各内容平台的用户协议与相关法律法规。',
      '所有解析记录仅保存在你的手机本地，不会上传服务器。',
      '因使用本工具产生的版权纠纷，由使用者自行承担。',
    ],
  },

  onShow() {
    this.calcStat();
  },

  calcStat() {
    const list = getHistory();
    const platSet = {};
    let today = 0;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startTs = start.getTime();

    list.forEach((v) => {
      if (v.platform) platSet[v.platform] = 1;
      if (Number(v.savedAt) >= startTs) today += 1;
    });

    this.setData({
      stat: {
        total: list.length,
        platforms: Object.keys(platSet).length,
        today,
      },
    });
  },

  toggleFaq(e) {
    const index = Number(e.currentTarget.dataset.index);
    const key = `faqs[${index}].open`;
    this.setData({ [key]: !this.data.faqs[index].open });
  },

  onMenu(e) {
    const key = e.currentTarget.dataset.key;
    const handlers = {
      guide: () => this.showGuide(),
      feedback: () => this.showFeedback(),
      clearCache: () => this.clearCache(),
      about: () => this.showAbout(),
    };
    (handlers[key] || (() => {}))();
  },

  showGuide() {
    wx.showModal({
      title: '链接获取方式',
      content:
        '抖音：作品右下角「分享」→ 复制链接\n' +
        '微博：视频右上角「…」→ 复制链接\n' +
        '小红书：右上角「分享」→ 复制链接\n' +
        '视频号：右下角「分享」→ 复制链接\n' +
        '即梦：作品详情页「分享」→ 复制链接\n' +
        '快手/B站：分享 → 复制链接\n\n' +
        '带文字的整段分享口令可以直接粘贴，会自动提取其中的链接。',
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#2B6DF6',
    });
  },

  showFeedback() {
    wx.showActionSheet({
      itemList: ['复制反馈邮箱', '复制客服微信'],
      success: (res) => {
        if (res.tapIndex === 0) copyText('support@yourdomain.com', '邮箱已复制');
        else copyText('your_wechat_id', '微信号已复制');
      },
      fail: () => {},
    });
  },

  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '将清除本地解析记录与临时文件，已保存到相册的视频不受影响。',
      confirmColor: '#F5483B',
      success: (m) => {
        if (!m.confirm) return;
        try {
          const fs = wx.getFileSystemManager();
          const { dataPath } = wx.env ? { dataPath: wx.env.USER_DATA_PATH } : {};
          if (dataPath) {
            const files = fs.readdirSync(dataPath);
            files.forEach((f) => {
              try {
                fs.unlinkSync(`${dataPath}/${f}`);
              } catch (e) {}
            });
          }
        } catch (e) {}

        try {
          wx.removeStorageSync('parse_history');
        } catch (e) {}

        this.calcStat();
        wx.showToast({ title: '已清理', icon: 'success' });
      },
    });
  },

  showAbout() {
    wx.showModal({
      title: '关于',
      content:
        '本小程序是一个视频素材备份工具，帮助你在获得授权的前提下备份自己或他人公开发布的视频内容。\n\n' +
        '我们不存储任何视频文件，解析结果实时生成、即时失效。\n\n' +
        '解析记录仅保存在你的设备本地。',
      showCancel: false,
      confirmText: '好的',
      confirmColor: '#2B6DF6',
    });
  },

  onShareAppMessage() {
    return {
      title: '一键解析无水印视频，支持抖音/微博/小红书',
      path: '/pages/index/index',
    };
  },
});
