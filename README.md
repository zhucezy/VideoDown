# VideoDown

输入视频 / 图片页面链接，解析主流平台的无水印原片与原图，支持最高分辨率、图集按选择保存到本地。

> 支持三类内容：**纯视频**、**纯图片 / 图文笔记**、**视频 + 图片混合**。结果会自动识别内容类型：视频页提供清晰度选择；图片页 / 混合页提供可勾选的图片网格，选择性保存。

## 仓库结构（monorepo）

```
VideoDown/
├── android/          🟢 当前主线路：Flutter 安卓客户端（编译 APK 侧载，绕过应用商店）
│   └── README.md        安卓运行 / 构建 / Railway 接入指南
├── server/           🔵 共享后端：Node.js 解析服务（小程序与安卓共用，部署到 Railway）
│   └── README.md        服务端运行 / 部署 / 接口契约
├── miniprogram/      🟡 历史方案：微信小程序前端（受域名白名单 / ICP 备案 / 审核限制，已搁置）
│   └── README.md        小程序版功能与配置说明
├── scripts/          测试与工具脚本（35 项冒烟 + 20 项端到端 + 图标生成）
├── LOCAL_DEBUG.md    服务端本机联调指南（小程序 / 安卓均可参考）
└── .gitignore
```

| 目录 | 状态 | 部署目标 | 说明 |
|------|------|----------|------|
| `android/` | ✅ 主推 | 用户本机编译 APK | 不限备案/域名，APK 侧载分发 |
| `server/` | ✅ 共用 | Railway（Node 主机） | 解析 + 代理中转，安卓/小程序都调它 |
| `miniprogram/` | ⏸ 搁置 | 微信（需备案+过审） | 受微信三道墙限制，仅作参考 |

## 快速路线（安卓 + Railway，推荐）

1. 把本仓库推到 GitHub
2. Railway 连 GitHub，Root Directory 选 `server`，自动拿到 `https://xxx.up.railway.app`
3. `cd android && flutter create --platform=android . && flutter pub get`
4. `flutter run --dart-define=BASE_URL=https://xxx.up.railway.app`
5. 出包：`flutter build apk --release --dart-define=BASE_URL=https://xxx.up.railway.app`

详细步骤见 [`android/README.md`](./android/README.md) 与 [`server/README.md`](./server/README.md)。

## 核心架构

小程序 / 安卓端做不了解析，有三道硬墙（域名白名单、无法自定义 Referer、平台接口需签名/Cookie），因此所有解析逻辑放在服务端：

```
用户粘贴链接
  → POST /api/parse（服务端）
      → 短链还原 → 平台路由 → 适配器抓取
      → 清晰度排序（分辨率 > 码率 > 体积），默认最高档
      → 全部直链改写成 HMAC 签名的 /api/dl 代理链接
  → 客户端下载（小程序 downloadFile / 安卓直接下载）
      → 服务端流式回源（带正确 Referer/UA，透传 Range）
  → 保存到相册
```

代理直链带有效期签名，篡改 / 过期均被拒，防止服务被当公共图床刷流量。

## 平台支持情况

| 平台 | 状态 | 说明 |
|------|------|------|
| 抖音 | ✅ 稳定 | 分享页 `_ROUTER_DATA`，`playwm→play` 去水印，多档码率 |
| 微博 | ✅ 稳定 | 正文 `m.weibo.cn/statuses/show`，视频号用 h5 component 接口 |
| 小红书 | ⚠️ 需 Cookie | `__INITIAL_STATE__`，风控较严，建议配 `COOKIE_XHS` |
| 即梦 | ✅ 可用 | `__NEXT_DATA__` + og:video 多重兜底，AI 生成内容本身无水印 |
| 快手 | ⚠️ 需 Cookie | 风控最严，未配 Cookie 大概率触发验证码 |
| B站 | ✅ 稳定 | `platform=html5` 取完整 MP4，避免 DASH 音视频分离 |
| 微信视频号 | ⚠️ 受限 | 见下方说明 |
| 其他 30+ 站点 | 🔄 兜底 | 通用解析器抓 og:video / video 标签 / JSON 中的 mp4 |

### 关于微信视频号

视频号**没有公开解析接口**，媒体流经过 AES 加密，密钥由客户端播放时下发。本项目处理：
- 粘贴 `finder.video.qq.com` 直链 → 可中转下载（未加密内容可正常播放）
- 粘贴 `channels.weixin.qq.com` 分享页 → 尝试提取，失败时给出明确指引

不做虚假承诺。

## 维护提醒

平台接口会变动（抖音 `_ROUTER_DATA`、小红书 `__INITIAL_STATE__` 历史上每年调整两三次）。`server/src/parsers/` 每个文件独立，某平台失效只改对应文件。建议定时跑样本链接巡检。

## 测试

```bash
node scripts/smoke-test.js       # 路由 / 签名 / 排序 / 工具函数，35 项
node scripts/e2e-test.js         # 端到端（含假源站验证代理链路），20 项
python scripts/gen_icons.py      # 重新生成小程序 tabBar 图标
```

## ⚠️ 合规须知

- 本工具仅供个人学习、研究与素材备份，请勿用于商业用途或二次分发
- 解析内容著作权归原作者所有，使用前应取得授权
- 各平台用户协议普遍禁止未授权抓取，批量使用存在账号与法律风险
- 微信小程序审核对「去水印 / 视频下载」类目极严；安卓 APK 侧载虽不受商店约束，仍建议定位为「个人素材管理工具」并附免责声明
