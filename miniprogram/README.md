# 视频解析下载小程序（微信小程序版 · 历史方案）

> ⚠️ 本目录是**历史方案**。微信小程序受域名白名单、ICP 备案、审核三道墙限制，项目已转向安卓路线（见仓库根 README 与 `android/`）。本目录保留作参考。

输入视频页面链接，解析主流平台的无水印原片/原图，支持最高分辨率与图集按选择保存。

> 支持三类内容：**纯视频**、**纯图片/图文笔记**、**视频+图片混合**。结果卡片会自动识别内容类型：视频页提供清晰度选择；图片页/混合页提供可勾选的图片网格，选择性保存。

```
miniprogram/
├── app.js/json/wxss    全局配置、自定义导航高度计算、静默登录
├── pages/
│   ├── index/          解析主页（广告位 + 输入 + 结果卡片）
│   ├── history/        解析记录
│   └── mine/           使用说明、FAQ、免责声明
├── components/
│   ├── ad-banner/      自适应广告位（高度随素材变化，无填充自动收起）
│   ├── nav-bar/        自定义导航栏
│   ├── platform-grid/  支持平台图标墙
│   └── result-card/    结果卡片：视频清晰度选择 / 图片网格勾选 / 进度 / 保存
├── utils/              config / request / download / storage / url / platforms
└── assets/tabbar/      脚本生成的 PNG 图标
```

## 快速开始

### 1. 启动服务端

```bash
cd ../server
cp .env.example .env      # 修改 PUBLIC_BASE 和 SIGN_SECRET
npm install
npm start
```

服务默认监听 3000 端口。生产环境需要用 Nginx/Caddy 套 HTTPS，因为微信小程序**只允许请求 HTTPS 域名**。

### 2. 配置小程序

编辑 `miniprogram/utils/config.js`：

```js
baseUrl: 'https://api.yourdomain.com',        // 你的服务端域名
ad: { bannerUnitId: 'adunit-xxxxxxxx' }       // 流量主广告位 ID
```

### 3. 配置服务器域名（关键，不配就用不了）

微信公众平台 → 开发 → 开发管理 → 开发设置 → 服务器域名：

| 类型 | 填写 |
|------|------|
| request 合法域名 | `https://api.yourdomain.com` |
| downloadFile 合法域名 | `https://api.yourdomain.com` |

两处**都要填**。`downloadFile` 少填一个，视频就下不下来。

### 4. 导入项目

微信开发者工具 → 导入项目 → 目录选 `miniprogram/` → 填入自己的 AppID。

## 核心设计

### 为什么必须有服务端？

小程序端做不了解析，有三道硬墙：

1. **域名白名单** — `wx.request` 只能请求预先备案的域名，各平台 API 域名成百上千
2. **无法自定义 Referer** — 小红书、B站 CDN 都有 Referer 防盗链
3. **平台接口需要签名/Cookie** — 抖音的 `_signature`、快手的风控 token

所以架构是：小程序 → 自建服务端 → 各平台，视频流也由服务端中转。

### 下载链路

```
用户粘贴链接
  → POST /api/parse
      → 短链还原 → 平台路由 → 适配器抓取
      → 清晰度排序（分辨率 > 码率 > 体积）
      → 探测前两档真实体积
      → 全部改写成 HMAC 签名的 /api/dl 代理链接
  → 小程序 wx.downloadFile（命中白名单域名）
      → 服务端流式回源（带 Referer/UA，透传 Range）
  → wx.saveVideoToPhotosAlbum
```

代理链接带 2 小时有效期签名，篡改和过期都会被拒，防止服务被当成公共图床刷流量。

### 最高分辨率保证

`sortQualities()` 按 `分辨率 → 码率 → 体积` 三级降序，`qualities[0]` 恒为最高画质，前端默认选中第 0 项并打上「最高」角标。用户想省流量可以手动往下切。

## 平台支持情况

| 平台 | 状态 | 说明 |
|------|------|------|
| 抖音 | ✅ 稳定 | 分享页 `_ROUTER_DATA`，`playwm→play` 去水印，多档码率 |
| 微博 | ✅ 稳定 | 正文用 `m.weibo.cn/statuses/show`，视频号用 h5 component 接口 |
| 小红书 | ⚠️ 需 Cookie | `__INITIAL_STATE__`，风控较严，建议配 `COOKIE_XHS` |
| 即梦 | ✅ 可用 | `__NEXT_DATA__` + og:video 多重兜底，AI 生成内容本身无水印 |
| 快手 | ⚠️ 需 Cookie | 风控最严，未配 Cookie 大概率触发验证码 |
| B站 | ✅ 稳定 | `platform=html5` 取完整 MP4，避免 DASH 音视频分离 |
| 微信视频号 | ⚠️ 受限 | 见下方说明 |
| 其他 30+ 站点 | 🔄 兜底 | 通用解析器抓 og:video / video 标签 / JSON 中的 mp4 |

### 关于微信视频号

视频号**没有公开解析接口**，且媒体流经过 AES 加密，解密密钥由客户端播放时下发。本项目处理方式：

- 粘贴 `finder.video.qq.com` 直链 → 可以中转下载（未加密内容可正常播放）
- 粘贴 `channels.weixin.qq.com` 分享页 → 尝试提取，失败时给出明确操作指引

不做虚假承诺。

## 维护提醒

平台接口会变。抖音的 `_ROUTER_DATA` 结构、小红书的 `__INITIAL_STATE__` 路径，历史上每年都要调整两三次。`server/src/parsers/` 下每个文件都是独立的，某个平台失效只需改对应文件，不影响其他平台。

建议加个定时任务，每天跑一遍各平台的样本链接，失效了自动告警。

## 测试

```bash
node ../scripts/smoke-test.js       # 路由 / 签名 / 排序 / 工具函数，35 项
python ../scripts/gen_icons.py      # 重新生成 tabBar 图标
```

## ⚠️ 合规须知

- 本工具仅供个人学习、研究与素材备份，请勿用于商业用途或二次分发
- 解析内容著作权归原作者所有，使用前应取得授权
- 各平台用户协议普遍禁止未授权抓取，批量使用存在账号与法律风险
- **微信小程序审核对「去水印/视频下载」类目非常严格**，直接以此为主要功能提交，过审概率很低。常见的合规化思路是：定位为「个人素材管理工具」、要求用户声明内容归属、加入显著的版权提示，并准备好相应的资质材料
