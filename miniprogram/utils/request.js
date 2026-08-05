const { CONFIG } = require('./config');

let refreshing = null;

function getToken() {
  try {
    return wx.getStorageSync('token') || '';
  } catch (e) {
    return '';
  }
}

function silentLogin() {
  if (refreshing) return refreshing;
  refreshing = new Promise((resolve) => {
    wx.login({
      success: ({ code }) => {
        if (!code) return resolve('');
        wx.request({
          url: `${CONFIG.baseUrl}/api/auth/login`,
          method: 'POST',
          data: { code },
          timeout: 8000,
          success: (res) => {
            const token = res.data && res.data.data && res.data.data.token;
            if (token) wx.setStorageSync('token', token);
            resolve(token || '');
          },
          fail: () => resolve(''),
        });
      },
      fail: () => resolve(''),
    });
  }).then((t) => {
    refreshing = null;
    return t;
  });
  return refreshing;
}

/**
 * 统一请求封装
 * 约定返回体：{ code: 0, message: 'ok', data: {...} }
 */
function request(options, _retry) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: /^https?:\/\//.test(options.url)
        ? options.url
        : `${CONFIG.baseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      timeout: options.timeout || CONFIG.timeout,
      header: Object.assign(
        {
          'content-type': 'application/json',
          Authorization: getToken() ? `Bearer ${getToken()}` : '',
        },
        options.header || {}
      ),
      success: async (res) => {
        const body = res.data || {};

        if (res.statusCode === 401 && !_retry) {
          await silentLogin();
          return request(options, true).then(resolve).catch(reject);
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject({
            code: res.statusCode,
            message: body.message || `服务异常(${res.statusCode})`,
          });
        }

        if (body.code !== 0) {
          return reject({
            code: body.code,
            message: body.message || '解析失败，请稍后再试',
            data: body.data,
          });
        }

        resolve(body.data);
      },
      fail: (err) => {
        const msg = /timeout/i.test(err.errMsg || '')
          ? '请求超时，请检查网络后重试'
          : '网络连接失败，请稍后再试';
        reject({ code: -1, message: msg, detail: err });
      },
    });
  });
}

module.exports = { request, silentLogin, getToken };
