# 华为云 FunctionGraph 部署指南（视频解析服务）

适用：服务端只做 `/api/parse` 轻量解析，安卓端用 Dio 直连源站下载（不经过函数）。
华为云是国内节点，端点为 `*.apigw.<区域>.myhuaweicloud.com`，**免备案、SNI 干净、手机直连秒通**，
从根上绕开 `vercel.app` 的 DNS 污染 + SNI-RST 双重封锁。

## 一、本地打包

在本机 `server/` 目录执行（需 Node 18+）：

```powershell
cd server
npm install --production
cd ..
Compress-Archive -Path server\* -DestinationPath video-parse-deploy.zip
```

> `video-parse-deploy.zip` 的根目录必须直接包含 `huawei-handler.js`、`src/`、`node_modules/` 等，
> 执行入口 `huawei-handler.handler` 要在 zip 根下。

## 二、创建函数（FunctionGraph 控制台）

1. **函数工作流** → **创建函数** → 选择「事件函数」「从零开始创建」
2. 基础配置：
   - 函数名称：`video-parse-server`
   - 运行时：Node.js 18
   - 代码入口（Handler）：`huawei-handler.handler`
   - 内存：256 MB（够用，解析峰值约 200–300MB，预留余量可选 512）
   - 超时：30 秒（解析一般几秒完成）
3. **上传代码**：上传上面打好的 `video-parse-deploy.zip`
4. **设置环境变量**（配置 → 环境变量）：
   - `FUNCTIONGRAPH` = `1`（关键：让 src/index.js 不自己 listen，改用回环 server）
   - `PORT` = `8000`
   - `SIGN_SECRET` = 任意随机复杂串（如 `vD9#mP2$kQ7xZ`）
   - `PUBLIC_BASE` = 先空着，建好 APIG 触发器后回填（见下）
5. 点「创建函数」

## 三、创建 APIG HTTP 触发器

1. 进函数详情 → **触发器** → **创建触发器**
2. 触发器类型：`APIG`（API 网关 / 共享版）
3. 安全认证：`NONE`（免鉴权，公开访问）
4. 其他默认 → 创建
5. 创建完成后，触发器会给出一个**调用 URL**，形如：
   ```
   https://<随机>.apigw.<区域>.myhuaweicloud.com/<分组路径>/<环境>/<函数名>
   ```
   记下这个 URL。

## 四、回填 PUBLIC_BASE 并验证

1. 回到函数 **配置 → 环境变量**，把 `PUBLIC_BASE` 设为上面那个调用 URL
   （如果调用 URL 带 `/<环境>/<函数名>` 路径，PUBLIC_BASE 也要带上完整路径，
    否则安卓端拿到的下载直链前缀会不对）
2. 保存后会自动重新部署
3. 浏览器 / curl 访问：
   ```
   <调用URL>/health
   ```
   应返回：`{"code":0,"message":"ok","data":{"time":...}}`

## 五、安卓端接入

```bash
flutter run --dart-define=BASE_URL=<调用URL，去掉末尾 /health>
```

例如 `BASE_URL=https://xxxx.apigw.cn-north-4.myhuaweicloud.com/v1/video-parse-server`

## 常见问题

- **/health 返回 404**：确认调用 URL 路径是否带环境前缀，PUBLIC_BASE 也要一致；
  另外 `/` 和 `/favicon` 返回 404 是**正常的**（服务端没有这两个路由）。
- **函数启动报端口占用**：确认环境变量 `FUNCTIONGRAPH=1` 已设，否则 src/index.js 会自己 listen 占端口。
- **免费额度**：FunctionGraph 每月 100 万次调用 + 40 万 GB·秒，个人解析服务绰绰有余。
