const { PLATFORMS, getPlatform } = require('../../utils/platforms');

Component({
  properties: {
    max: { type: Number, value: 12 },
  },

  data: {
    list: [],
  },

  lifetimes: {
    attached() {
      this.setData({ list: PLATFORMS.slice(0, this.data.max) });
    },
  },

  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key;
      const p = getPlatform(key);
      if (!p) return;
      wx.showToast({
        title: p.tip || `支持${p.name}，直接粘贴链接即可`,
        icon: 'none',
        duration: 2200,
      });
      this.triggerEvent('select', { key });
    },
  },
});
