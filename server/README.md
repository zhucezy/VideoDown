# 视频解析服务端（解析 / 代理中转）

为前端（微信小程序 / 安卓 APP）提供多平台视频与图片的无水印解析，并以 HMAC 签名代理绕开各平台 CDN 防盗链。

本目录是**独立可部署单元**：可直接推到 GitHub 后用 Railway 部署，也可本机 `node src/index.js` 运行。

## 技术栈

- Node.js ≥ 18（已写入 `package.json` 的 `engines`）
- Express + cors + dotenv
- 无数据库，限流与签名均在内存/环境变量层完成

## 目录

```
server/
├── src/
│   ├── index.js         Express 入口：/api/parse、/api/dl、/api/platforms、/health
│   ├── proxy.js         视频流式中转（带 Referer/UA 回源，透传 Range）
│   ├── parsers/         8 个平台适配器 + 通用兜底
│   └── utils/           http / sign(HMAC) / common
├── railway.json         ★ Railway 部署配置（nixpacks + 自动注入 PUBLIC_BASE）
├── Procfile             兜底启动命令（web: node src/index.js）
├── .env.example         环境变量模板
└── package.json
```

## 本地运行

```bash
cd server
cp .env.example .env      # 至少改 SIGN_SECRET 和 PUBLIC_BASE
npm install
npm start                # 默认 http://localhost:3000
```

健康检查：`GET /health` → `{"code":0,"data":{"status":"ok"}}`

## 部署到 Railway（GitHub 集成）

1. 把整个 VideoDown 仓库推到 GitHub
2. Railway 新建 Project → Deploy from GitHub → 选择本仓库，Root Directory 填 `server`
3. `railway.json` 已配置：
   - builder: `nixpacks`（自动读 `package.json` 的 `start` 脚本）
   - 自动注入 `PUBLIC_BASE=https://${{RAILWAY_PUBLIC_DOMAIN}}`（域名自动识别）
   - 注入 `HOST=0.0.0.0`，并声明 `/health` 健康检查
4. 部署完成后得到 `https://xxx.up.railway.app`，填到前端 `BASE_URL`

> 也可用 `Procfile` 兜底：`web: node src/index.js`。两者并存时 Railway 优先用 `railway.json`。

## 环境变量（见 .env.example）

| 变量 | 说明 |
|------|------|
| `PORT` | 监听端口，默认 3000 |
| `PUBLIC_BASE` | 对外访问地址，必须与返回给前端的代理直链域名一致 |
| `SIGN_SECRET` | 代理直链 HMAC 签名密钥，**务必改成随机长字符串** |
| `SIGN_TTL` | 代理直链有效期（秒），默认 7200 |
| `HOST` | 绑定地址，部署环境填 `0.0.0.0` |
| `RATE_MAX` | 单 IP 每分钟解析上限，默认 20 |
| `FETCH_TIMEOUT` | 抓取超时（毫秒），默认 12000 |
| `COOKIE_*` | 各平台登录 Cookie（可选，配后成功率显著提升） |

## 接口契约

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/parse` | body: `{url}` → 返回 qualities(视频多档) + images(图片数组)，直链均改写为签名代理地址 |
| GET  | `/api/dl?u=...&s=...` | 签名代理下载/中转，带签名与有效期校验 |
| GET  | `/api/platforms` | 返回支持的平台列表 |
| GET  | `/health` | 健康检查 |

详细平台支持与风控说明见仓库根 README 的「平台支持情况」章节。
