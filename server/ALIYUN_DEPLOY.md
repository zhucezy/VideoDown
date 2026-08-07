# 阿里云函数计算 FC 部署指南（Web 函数 + HTTP 触发器）

> 适用场景：视频/图片解析服务（只做 `/api/parse` 轻量解析，安卓端用 Dio 带防盗链头直连源站下载）。
> 这是当前**最优**部署方案：免费额度充足、无需付费 API 网关、端点 `*.fc.aliyuncs.com` / `*.fcapp.run` 为国内域名（GFW 不封锁，手机直连秒通）、函数在国内地域运行拉国内平台源站更快。

## 为什么选阿里云 FC（而非华为云 / Vercel）

| 平台 | 公网访问 | 是否付费 | GFW |
|------|---------|---------|------|
| Vercel | 免费 | 但 `vercel.app` 被 DNS 污染 + SNI-RST 双重封锁，国内访问不了 | ❌ 不可用 |
| 华为云 FunctionGraph | 必须买 **APIG 专享版**（共享版 2025-04-30 退市） | 付费 | 国内可通，但被卡付费墙 |
| **阿里云 FC（Web 函数 + HTTP 触发器）** | **内置 HTTP 触发器免费生成公网地址，无需 API 网关** | **免费额度充足** | 国内域名，可直连 ✅ |

官方说明：HTTP 触发器「创建后生成公网访问地址，适合构建轻量级 API」；Web 函数「兼容 Node.js Express，可快速迁移现有应用」。

## 免费额度（个人够用）

- 新认证用户：每月 **15 万 CU** 试用额度 × 3 个月（free.aliyun.com 领取）
- 长期：每月 **100 万次调用 + 40 万 GB·秒** + **中国内地 20 GB/月 公网流量**
- 解析服务是轻量 I/O 型，个人几乎零花费

## 一、本机打包

```powershell
cd server
npm install --production
cd ..
Compress-Archive -Path server\* -DestinationPath aliyun-deploy.zip
```

> zip 根目录必须直接含 `src/`、`node_modules/`、`package.json`、`huawei-handler.js`（多余文件无害）、`bootstrap`（无害）。**不要**多套一层 `server/` 文件夹。

## 二、控制台创建 Web 函数

1. 进入**函数计算 FC** 控制台 → 左上角选**国内地域**（推荐 `cn-hangzhou` 杭州 / `cn-shanghai` 上海 / `cn-beijing` 北京）
2. **服务及函数 → 创建服务**（名称如 `video-parse-service`，日志功能可开启）
3. 服务下 **创建函数 → Web 函数**（⚠️ 选「Web 函数」，不是「事件函数」）
4. 基础配置：
   - 函数名称：`video-parse-server`
   - 运行环境：**Node.js 18**
   - 代码上传方式：**ZIP 包**，上传上面打的 `aliyun-deploy.zip`
   - 启动命令：**`node src/index.js`**
   - 监听端口：函数计算会自动注入 `$PORT`（默认 9000），服务端已用 `process.env.PORT` 兼容；若控制台提示端口不匹配，在函数环境变量里显式设 `PORT=9000`
   - 内存：256 MB（解析峰值约 200–300MB，可选 512 留余量）
   - 超时：30 秒
5. **高级设置 → 函数访问公网：开启**（解析要拉外网，必须开）
6. 点「创建函数」

## 三、HTTP 触发器（免费公网地址）

- 创建 Web 函数时，FC **自动创建一个默认 HTTP 触发器**（defaultTrigger），无需手动建 API 网关
- 在该触发器配置里，**认证方式选「无需认证」**（否则安卓端每次要带签名，麻烦）
- 触发器列表会显示**公网访问地址**，形如：
  ```
  https://<随机id>.<region>.fc.aliyuncs.com/<version>/proxy/<service>/<function>/
  ```
  或新版 `https://<id>.<region>.fcapp.run/...`
- 复制这串**完整 URL**（含 `/proxy/...` 路径段）

> 若没自动建，进函数「触发器」标签 → 创建触发器 → 类型 **HTTP 触发器** → 认证方式 **无需认证** → 创建。

## 四、环境变量

函数「配置 → 环境变量」添加：

```
SIGN_SECRET  = 任意随机复杂串（如 vD9#mP2$kQ7xZ）
PUBLIC_BASE  = 先空着，下一步回填
```

> ⚠️ **不要设** `VERCEL` / `FUNCTIONGRAPH` 这两个环境变量，否则服务端会跳过 listen。阿里云下让 app 自己 listen 即可。

保存后，把 **第三步的完整触发器 URL** 回填到 `PUBLIC_BASE` → 保存（自动重部署）。

## 五、验证

浏览器 / 手机访问：

```
<完整触发器URL>/health
```

返回 `{"code":0,"message":"ok","data":{"time":...}}` 即成功。

## 六、安卓端接入

```bash
flutter run --dart-define=BASE_URL=<完整触发器URL，去掉末尾 /health>
```

例如 `BASE_URL=https://abc123.cn-hangzhou.fc.aliyuncs.com/2023-07-01/proxy/video-parse-service/video-parse-server`。

## 七、常见问题

- **端口不匹配 / 函数启动后立即退出**：确认启动命令是 `node src/index.js`，且函数环境变量 `PORT` 与控制台「监听端口」一致（默认 9000）。服务端 `config.port = process.env.PORT || 3000` 已兼容。
- **冷启动慢**：首次请求可能几百 ms，之后实例保活会快。个人低频使用无感。
- **想用干净域名**：可在 FC 绑定自定义域名（需你有可改 DNS 的域名，且国内域名要 ICP 备案）。默认 `fc.aliyuncs.com` 地址已够用，不必折腾。
- **小程序端**：依赖 `/api/dl` 代理下载，在 Serverless 下不稳定，按既定方案小程序端作备份，主用安卓端直连。

## 八、与华为云方案的对照

之前华为云卡在「APIG 专享版付费」；阿里云用 **Web 函数 + 内置 HTTP 触发器** 天然免费公网，代码零改动（华为的 `huawei-handler.js` / `bootstrap` 在阿里云下不会被调用，可忽略）。
