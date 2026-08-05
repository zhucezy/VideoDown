const config = require('../config');

const UA = {
  ios:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android:
    'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/120.0.0.0 Mobile Safari/537.36',
  pc:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/120.0.0.0 Safari/537.36',
  wechat:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.44(0x18002c2b) NetType/WIFI',
};

/**
 * 带超时的 fetch
 */
async function req(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeout || config.fetchTimeout
  );

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      redirect: options.redirect || 'follow',
      signal: controller.signal,
      headers: Object.assign(
        {
          'User-Agent': options.ua || UA.ios,
          Accept: '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        options.headers || {}
      ),
      body: options.body,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url, options = {}) {
  const res = await req(url, options);
  return { text: await res.text(), res };
}

async function getJson(url, options = {}) {
  const res = await req(url, options);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    // 有的接口会包 jsonp 或前缀
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (e2) {}
    }
    throw new Error('响应不是合法 JSON');
  }
}

/**
 * 还原短链：只发 HEAD/GET 不跟随，取 Location。
 * 部分平台需要多跳，最多跟 5 次。
 */
async function resolveRedirect(url, options = {}) {
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = await req(current, {
      method: 'GET',
      redirect: 'manual',
      ua: options.ua,
      headers: options.headers,
      timeout: options.timeout,
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = loc.startsWith('http') ? loc : new URL(loc, current).href;
      continue;
    }
    return { finalUrl: current, res };
  }
  return { finalUrl: current, res: null };
}

/**
 * 探测远端文件大小与真实地址（很多平台直链本身还带 302）
 */
async function probe(url, headers = {}) {
  try {
    const res = await req(url, {
      method: 'GET',
      headers: Object.assign({ Range: 'bytes=0-1' }, headers),
      redirect: 'follow',
      timeout: 8000,
    });
    let size = 0;
    const cr = res.headers.get('content-range');
    if (cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) size = Number(m[1]);
    }
    if (!size) size = Number(res.headers.get('content-length') || 0);
    // 主动断开，避免把整个视频拉下来
    if (res.body && typeof res.body.cancel === 'function') {
      res.body.cancel().catch(() => {});
    }
    return { size, finalUrl: res.url || url };
  } catch (e) {
    return { size: 0, finalUrl: url };
  }
}

module.exports = { req, getText, getJson, resolveRedirect, probe, UA };
