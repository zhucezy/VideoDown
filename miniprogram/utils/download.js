const { CONFIG } = require('./config');

/**
 * 相册写入授权：
 * 首次直接调用保存 API 会自动弹窗；用户拒绝过之后必须引导去设置页开启。
 */
function ensureAlbumAuth() {
  return new Promise((resolve, reject) => {
    wx.getSetting({
      success: (res) => {
        const state = res.authSetting['scope.writePhotosAlbum'];
        if (state === true) return resolve(true);

        if (state === false) {
          wx.showModal({
            title: '需要相册权限',
            content: '保存视频到手机需要「添加到相册」权限，请在设置中开启。',
            confirmText: '去设置',
            confirmColor: '#2B6DF6',
            success: (m) => {
              if (!m.confirm) return reject({ message: '已取消保存' });
              wx.openSetting({
                success: (s) => {
                  if (s.authSetting['scope.writePhotosAlbum']) resolve(true);
                  else reject({ message: '未开启相册权限' });
                },
                fail: () => reject({ message: '打开设置失败' }),
              });
            },
            fail: () => reject({ message: '已取消保存' }),
          });
          return;
        }

        // undefined：尚未询问过，交给系统在保存时弹窗
        resolve(true);
      },
      fail: () => resolve(true),
    });
  });
}

/**
 * 下载文件并回调进度
 * @param {string} url  必须是 downloadFile 合法域名下的地址（走自建代理）
 * @param {function} onProgress (percent:number, writtenMB:string, totalMB:string)
 */
function downloadFile(url, onProgress) {
  return new Promise((resolve, reject) => {
    const task = wx.downloadFile({
      url,
      timeout: CONFIG.downloadTimeout,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          resolve(res.tempFilePath);
        } else {
          reject({ message: `下载失败(${res.statusCode})` });
        }
      },
      fail: (err) => {
        const msg = /timeout/i.test(err.errMsg || '')
          ? '下载超时，可尝试切换较低清晰度'
          : '下载失败，链接可能已失效';
        reject({ message: msg, detail: err });
      },
    });

    if (typeof onProgress === 'function') {
      task.onProgressUpdate((p) => {
        onProgress(
          p.progress,
          (p.totalBytesWritten / 1048576).toFixed(1),
          (p.totalBytesExpectedToWrite / 1048576).toFixed(1)
        );
      });
    }
    return task;
  });
}

function saveVideo(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.saveVideoToPhotosAlbum({
      filePath: tempFilePath,
      success: resolve,
      fail: (err) => {
        const denied = /auth deny|authorize|permission/i.test(err.errMsg || '');
        reject({
          message: denied ? '未授权保存到相册' : '保存失败，请重试',
          denied,
          detail: err,
        });
      },
    });
  });
}

function saveImage(tempFilePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath: tempFilePath,
      success: resolve,
      fail: (err) => reject({ message: '保存失败，请重试', detail: err }),
    });
  });
}

/** 复制文本 */
function copyText(text, tip) {
  return new Promise((resolve) => {
    wx.setClipboardData({
      data: String(text || ''),
      success: () => {
        wx.hideToast();
        wx.showToast({ title: tip || '已复制', icon: 'none' });
        resolve(true);
      },
      fail: () => resolve(false),
    });
  });
}

module.exports = {
  ensureAlbumAuth,
  downloadFile,
  saveVideo,
  saveImage,
  copyText,
};
