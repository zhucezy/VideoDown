/**
 * 全局配置
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 本机联调：把 ENV 设为 'dev'（默认），并在微信开发者工具里勾选   │
 * │ 「不校验合法域名、TLS版本以及HTTPS证书」即可直连本地服务。       │
 * │ 上线部署前：把 ENV 改回 'prod'，并填好 prod.baseUrl。          │
 * └─────────────────────────────────────────────────────────────┘
 *
 * ⚠️ dev.baseUrl 必须与 server/.env 里的 PUBLIC_BASE 完全一致：
 *    - 模拟器调试：http://127.0.0.1:3000
 *    - 真机调试  ：改成你电脑的局域网 IP，例如 http://192.168.1.10:3000
 *      （两处要同时改，否则下载直链地址对不上，会下载失败）
 */
const ENV = 'dev'; // 'dev' | 'prod'  ← 联调用 'dev'，上线改 'prod'

const ENV_MAP = {
  dev: {
    // 本地服务地址（127.0.0.1 在模拟器里指向你的开发电脑）
    baseUrl: 'http://127.0.0.1:3000',
  },
  prod: {
    // 上线时填已在「微信公众平台 → 开发设置 → 服务器域名」配置过的 HTTPS 域名
    baseUrl: 'https://api.yourdomain.com',
  },
};

const CONFIG = {
  baseUrl: ENV_MAP[ENV].baseUrl,

  // 是否启用静默登录（需要服务端实现 /api/auth/login）
  enableLogin: true,

  // 请求超时（解析类接口耗时较长）
  timeout: 20000,
  downloadTimeout: 180000,

  // ===== 广告位 =====
  ad: {
    // 在「流量主 → 广告位管理」创建 banner 广告位后填入 unit-id
    bannerUnitId: 'adunit-xxxxxxxxxxxxxxxx',
    // 视频保存成功后弹出的激励视频（可选，留空则不启用）
    rewardedUnitId: '',
    // banner 自动刷新间隔（秒），最低 30
    interval: 60,
    // 广告加载失败时是否彻底隐藏容器（避免留白）
    hideOnError: true,
  },

  // 历史记录上限
  historyLimit: 100,
};

module.exports = { CONFIG, ENV };
