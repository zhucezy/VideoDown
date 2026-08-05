const app = getApp();

Component({
  properties: {
    title: { type: String, value: '' },
    bg: { type: String, value: 'transparent' },
    color: { type: String, value: '#16181D' },
    showBack: { type: Boolean, value: false },
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    totalHeight: 64,
  },

  lifetimes: {
    attached() {
      const g = (app && app.globalData) || {};
      const statusBarHeight = g.statusBarHeight || 20;
      const navBarHeight = g.navBarHeight || 44;
      this.setData({
        statusBarHeight,
        navBarHeight,
        totalHeight: statusBarHeight + navBarHeight,
      });
    },
  },

  methods: {
    onBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) wx.navigateBack();
      else wx.switchTab({ url: '/pages/index/index' });
    },
  },
});
