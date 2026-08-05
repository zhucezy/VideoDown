const {
  ensureAlbumAuth,
  downloadFile,
  saveVideo,
  saveImage,
  copyText,
} = require('../../utils/download');
const { getPlatform } = require('../../utils/platforms');

Component({
  properties: {
    data: {
      type: Object,
      value: null,
      observer(val) {
        if (!val) return;
        const p = getPlatform(val.platform);
        const qualities = (val.qualities || []).filter((q) => q && q.url);
        const images = (val.images || []).map((img) => ({
          url: img.url,
          width: img.width || 0,
          height: img.height || 0,
        }));
        const hasVideo = qualities.length > 0;
        const hasImages = images.length > 0;
        const contentType = hasVideo && hasImages
          ? 'mixed'
          : hasImages
          ? 'image'
          : 'video';
        const selected = images.map(() => true);

        this.setData({
          platColor: (p && p.color) || '#2B6DF6',
          qualityIndex: hasVideo ? 0 : -1,
          currentQuality: qualities[0] || {},
          hasVideo,
          hasImages,
          contentType,
          imageCount: images.length,
          selectedImages: selected,
          selectedCount: images.length,
          primaryLabel: this._primaryLabel(hasVideo, images.length),
        });
      },
    },
  },

  data: {
    qualityIndex: 0,
    currentQuality: {},
    platColor: '#2B6DF6',
    hasVideo: false,
    hasImages: false,
    contentType: 'video',
    imageCount: 0,
    selectedImages: [],
    selectedCount: 0,
    primaryLabel: '保存无水印视频',
    downloading: false,
    percent: 0,
    progressText: '',
    imgSaving: false,
    imgProgressText: '',
  },

  methods: {
    _primaryLabel(hasVideo, selCount) {
      if (hasVideo) return '保存无水印视频';
      if (selCount) return `保存图片(${selCount})`;
      return '请选择图片';
    },

    onSelectQuality(e) {
      if (this.data.downloading) return;
      const index = Number(e.currentTarget.dataset.index);
      const q = this.data.data.qualities[index];
      if (!q) return;
      wx.vibrateShort({ type: 'light' });
      this.setData({ qualityIndex: index, currentQuality: q });
    },

    onCoverError() {
      this.setData({ 'data.cover': '' });
    },

    onPreview() {
      const url = this.data.currentQuality.url;
      if (!url) return;
      this.triggerEvent('preview', { url, data: this.data.data });
    },

    /** 封面区点击：视频页预览视频，图片页预览大图 */
    onCoverTap(e) {
      if (this.data.hasVideo) {
        this.onPreview();
      } else {
        this.onPreviewImage(e);
      }
    },

    /** 单张图片预览（调起微信原生大图查看，可保存） */
    onPreviewImage(e) {
      const index = Number(e.currentTarget.dataset.index);
      const urls = this.data.data.images.map((img) => img.url);
      wx.previewImage({ current: urls[index], urls });
    },

    /** 切换某张图片的选中态 */
    onToggleImage(e) {
      if (this.data.imgSaving) return;
      const idx = Number(e.currentTarget.dataset.index);
      const key = `selectedImages[${idx}]`;
      const next = !this.data.selectedImages[idx];
      this.setData({ [key]: next }, () => {
        const c = this.data.selectedImages.filter(Boolean).length;
        this.setData({
          selectedCount: c,
          primaryLabel: this._primaryLabel(this.data.hasVideo, c),
        });
      });
    },

    /** 全选 / 取消全选 */
    onToggleAll() {
      if (this.data.imgSaving) return;
      const allSel =
        this.data.data.images.length &&
        this.data.selectedImages.every(Boolean);
      const next = this.data.data.images.map(() => !allSel);
      this.setData({
        selectedImages: next,
        selectedCount: allSel ? 0 : next.length,
        primaryLabel: this._primaryLabel(this.data.hasVideo, allSel ? 0 : next.length),
      });
    },

    /** 主按钮：视频页保存视频；纯图片页保存选中图片 */
    onSavePrimary() {
      if (this.data.imgSaving || this.data.downloading) return;
      if (!this.data.hasVideo) return this.onSaveImages();
      return this.onSaveVideo();
    },

    /** 保存视频到相册 */
    async onSaveVideo() {
      const q = this.data.currentQuality;
      if (!q || !q.url) {
        wx.showToast({ title: '暂无可用下载地址', icon: 'none' });
        return;
      }
      if (this.data.downloading) return;

      try {
        await ensureAlbumAuth();
      } catch (err) {
        wx.showToast({ title: err.message || '未授权', icon: 'none' });
        return;
      }

      this.setData({ downloading: true, percent: 0, progressText: '准备下载…' });
      wx.showLoading({ title: '下载中 0%', mask: true });

      try {
        const tempPath = await downloadFile(q.url, (percent, written, total) => {
          this.setData({
            percent,
            progressText: `${written}MB / ${total}MB`,
          });
          wx.showLoading({ title: `下载中 ${percent}%`, mask: true });
        });

        wx.showLoading({ title: '正在写入相册…', mask: true });
        await saveVideo(tempPath);
        wx.hideLoading();

        wx.showToast({ title: '已保存到相册', icon: 'success' });
        this.triggerEvent('saved', { type: 'video', quality: q });
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
        this.triggerEvent('savefail', { error: err });
      } finally {
        this.setData({ downloading: false, percent: 0, progressText: '' });
      }
    },

    /** 保存封面 */
    async onSaveCover() {
      const cover = this.data.data.coverDownload || this.data.data.cover;
      if (!cover) {
        wx.showToast({ title: '暂无封面', icon: 'none' });
        return;
      }
      try {
        await ensureAlbumAuth();
        wx.showLoading({ title: '保存中…', mask: true });
        const temp = await downloadFile(cover);
        await saveImage(temp);
        wx.hideLoading();
        wx.showToast({ title: '封面已保存', icon: 'success' });
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      }
    },

    /** 按勾选批量保存图片（图集 / 纯图片页） */
    async onSaveImages() {
      const all = this.data.data.images || [];
      const idxs = this.data.selectedImages
        .map((s, i) => (s ? i : -1))
        .filter((i) => i >= 0);
      if (!idxs.length) {
        wx.showToast({ title: '请先选择要保存的图片', icon: 'none' });
        return;
      }
      if (this.data.imgSaving) return;

      try {
        await ensureAlbumAuth();
      } catch (err) {
        wx.showToast({ title: err.message || '未授权', icon: 'none' });
        return;
      }

      this.setData({ imgSaving: true, imgProgressText: `0/${idxs.length}` });
      let ok = 0;
      for (let k = 0; k < idxs.length; k++) {
        const img = all[idxs[k]];
        const url = img.url || img;
        if (!url) continue;
        wx.showLoading({ title: `保存中 ${k + 1}/${idxs.length}`, mask: true });
        try {
          const temp = await downloadFile(url);
          await saveImage(temp);
          ok += 1;
        } catch (e) {
          // 单张失败不中断整体流程
        }
        this.setData({ imgProgressText: `${k + 1}/${idxs.length}` });
      }
      wx.hideLoading();
      this.setData({ imgSaving: false });
      wx.showToast({
        title: `已保存 ${ok}/${idxs.length} 张`,
        icon: ok ? 'success' : 'none',
      });
      if (ok > 0) this.triggerEvent('saved', { type: 'image', count: ok });
    },

    onCopyTitle() {
      const d = this.data.data;
      copyText(d.rawTitle || d.title || '', '文案已复制');
    },

    onCopyUrl() {
      const url = this.data.currentQuality.originUrl || this.data.currentQuality.url;
      copyText(url, '直链已复制');
    },
  },
});
