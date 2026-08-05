const { CONFIG } = require('./utils/config');

App({
  globalData: {
    // 状态栏 / 胶囊按钮尺寸，供自定义导航栏使用
    statusBarHeight: 20,
    navBarHeight: 44,
    menuButtonRect: null,
    systemInfo: null,
    // 服务端下发的可用平台清单（拉取失败时用本地兜底）
    platforms: null,
    // 是否已通过接口拿到广告开关
    adEnabled: true,
  },

  onLaunch() {
    this.initSystemInfo();
    this.initSession();
  },

  /**
   * 计算自定义导航栏高度：
   * navBarHeight = (胶囊top - 状态栏高度) * 2 + 胶囊高度
   */
  initSystemInfo() {
    let info = {};
    try {
      // getSystemInfoSync 已不推荐，优先使用新的分类 API
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
      info = Object.assign({}, windowInfo, deviceInfo);
    } catch (e) {
      info = wx.getSystemInfoSync();
    }

    const statusBarHeight = info.statusBarHeight || 20;
    let navBarHeight = 44;
    let menuButtonRect = null;

    try {
      menuButtonRect = wx.getMenuButtonBoundingClientRect();
      if (menuButtonRect && menuButtonRect.height) {
        navBarHeight =
          (menuButtonRect.top - statusBarHeight) * 2 + menuButtonRect.height;
      }
    } catch (e) {
      navBarHeight = 44;
    }

    this.globalData.systemInfo = info;
    this.globalData.statusBarHeight = statusBarHeight;
    this.globalData.navBarHeight = Math.round(navBarHeight);
    this.globalData.menuButtonRect = menuButtonRect;
  },

  /**
   * 静默登录：用 code 换取服务端会话，用于接口限流与配额统计。
   * 服务端不可用时不阻塞主流程，解析接口会走匿名配额。
   */
  initSession() {
    if (!CONFIG.enableLogin) return;
    wx.login({
      success: ({ code }) => {
        if (!code) return;
        wx.request({
          url: `${CONFIG.baseUrl}/api/auth/login`,
          method: 'POST',
          data: { code },
          timeout: 8000,
          success: (res) => {
            const token = res.data && res.data.data && res.data.data.token;
            if (token) wx.setStorageSync('token', token);
          },
          fail: () => {},
        });
      },
    });
  },
});
