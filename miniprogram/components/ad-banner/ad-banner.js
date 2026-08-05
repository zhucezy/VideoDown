const { CONFIG } = require('../../utils/config');

Component({
  options: {
    virtualHost: false,
  },

  properties: {
    // 传空则读取全局配置
    unitId: {
      type: String,
      value: '',
    },
    interval: {
      type: Number,
      value: 0,
    },
    // 是否允许用户手动关闭（关闭后本次会话不再展示）
    closable: {
      type: Boolean,
      value: false,
    },
    // 上下外边距，单位 rpx
    gap: {
      type: Number,
      value: 0,
    },
  },

  data: {
    status: 'loading', // loading | loaded | error
    boxHeight: 'auto',
  },

  lifetimes: {
    attached() {
      const unitId = this.data.unitId || CONFIG.ad.bannerUnitId || '';
      const valid = unitId && unitId.indexOf('adunit-x') !== 0;
      this.setData({
        unitId: valid ? unitId : '',
        interval: this.data.interval || CONFIG.ad.interval,
        // 未配置真实 unit-id 时直接进入 loaded，展示开发占位
        status: valid ? 'loading' : 'loaded',
      });

      // 兜底：8s 内没有任何回调，判定为无填充并收起，防止长期骨架
      this.timer = setTimeout(() => {
        if (this.data.status === 'loading') {
          this.setData({ status: CONFIG.ad.hideOnError ? 'error' : 'loaded' });
          this.triggerEvent('adstate', { state: 'timeout' });
        }
      }, 8000);
    },
    detached() {
      if (this.timer) clearTimeout(this.timer);
    },
  },

  methods: {
    /**
     * 广告加载成功：
     * <ad> 组件自身高度已由素材决定，这里再测量一次真实高度回传给页面，
     * 供需要计算滚动区域 / 吸顶偏移的场景使用。
     */
    onAdLoad() {
      if (this.timer) clearTimeout(this.timer);
      this.setData({ status: 'loaded' });

      wx.nextTick(() => {
        const query = this.createSelectorQuery();
        query
          .select('#adInner')
          .boundingClientRect((rect) => {
            const h = rect && rect.height ? Math.ceil(rect.height) : 0;
            if (h > 0) {
              this.setData({ boxHeight: `${h}px` });
              this.triggerEvent('adstate', { state: 'loaded', height: h });
            } else {
              this.triggerEvent('adstate', { state: 'loaded', height: 0 });
            }
          })
          .exec();
      });
    },

    onAdError(e) {
      if (this.timer) clearTimeout(this.timer);
      const detail = e && e.detail ? e.detail : {};
      // 1004 = 无合适的广告；1005 = 广告组件审核中；1008 = 广告单元已关闭
      this.setData({
        status: CONFIG.ad.hideOnError ? 'error' : 'loaded',
        boxHeight: 'auto',
      });
      this.triggerEvent('adstate', {
        state: 'error',
        errCode: detail.errCode,
        errMsg: detail.errMsg,
      });
    },

    onAdClose() {
      this.setData({ status: 'error', boxHeight: 'auto' });
      this.triggerEvent('adstate', { state: 'closed' });
    },

    onManualClose() {
      this.setData({ status: 'error' });
      this.triggerEvent('adstate', { state: 'closed' });
    },

    onPlaceholderTap() {
      wx.showModal({
        title: '广告位未配置',
        content:
          '请先在微信公众平台开通「流量主」，创建 Banner 广告位后，把 unit-id 填入 miniprogram/utils/config.js 的 ad.bannerUnitId。',
        showCancel: false,
        confirmColor: '#2B6DF6',
      });
    },
  },
});
