# 华为云 FunctionGraph 部署指南（视频解析服务）

适用：服务端只做 `/api/parse` 轻量解析，安卓端用 Dio 直连源站下载（不经过函数）。
华为云是国内节点，HTTP 函数端点免备案、SNI 干净、手机直连秒通，
从根上绕开 `vercel.app` 的 DNS 污染 + SNI-RST 双重封锁。

## 重要背景：API 网关共享版已退市

华为云 API 网关**共享版已于 2025-04-30 在中国站正式退市**，控制台现在只能看到专享版
（需购买实例、付费）。因此：

- 若用「事件函数 + APIG 触发器」，必须购买专享版 APIG 实例（付费，见方案二）。
- **推荐用「HTTP 函数」**：FunctionGraph 的 HTTP 函数创建后平台直接分配公网 URL，
  不需要你自建 APIG 实例、不要求专享版，零额外费用。本指南主推此方案。

---

## 方案一：HTTP 函数（推荐，免 APIG 实例）

### 1. 本地打包

在本机 `server/` 目录执行（需 Node 18+）：

```powershell
cd server
npm install --production
cd ..
Compress-Archive -Path server\* -DestinationPath video-parse-deploy.zip
```

> `video-parse-deploy.zip` 根目录必须直接包含 `bootstrap`、`src/`、`node_modules/` 等。
> `bootstrap` 是 HTTP 函数的启动文件（内容为 `node src/index.js`）。

### 2. 创建 HTTP 函数

1. **函数工作流** → **创建函数** → 函数类型选 **「HTTP 函数」** → 创建空白函数
2. 区域：北京四（cn-north-4）
3. 函数名称：`video-parse-server`
4. 运行时：Node.js 18
5. **高级设置 → 函数访问公网：开启**（解析要拉外网平台页面，必须开）
6. 上传代码：上传 `video-parse-deploy.zip`（平台自动识别 `bootstrap` 启动文件）
7. 内存 256 MB、超时 30 秒
8. **环境变量**：
   - `HOST` = `127.0.0.1`（HTTP 函数要求绑定 127.0.0.1）
   - `PORT` = `8000`（HTTP 函数固定端口 8000）
   - `SIGN_SECRET` = 任意随机复杂串（如 `vD9#mP2$kQ7xZ`）
   - `PUBLIC_BASE` = 先空着，拿到 URL 后回填（见下）
   - ⚠️ **不要设 `FUNCTIONGRAPH`**（HTTP 函数下要让 src/index.js 自己 listen）
9. 保存

### 3. 拿到访问 URL

进函数详情 → **配置 → 触发器**，会显示平台分配的访问 URL，形如：

```
https://<id>.apigf.cn-north-4.myhuaweicloud.com/video-parse-server
```

（具体子域以控制台实际显示为准，一般是 `apigf` / `apigw` / `apic` 之一）
**复制这个完整 URL**——它就是安卓端 `BASE_URL` 和 `PUBLIC_BASE` 要填的值。

### 4. 回填 PUBLIC_BASE 并验证

1. **配置 → 环境变量**，把 `PUBLIC_BASE` 设为上面的完整 URL（含 `/video-parse-server` 路径）
2. 保存后会自动重新部署
3. 浏览器 / curl 访问 `<URL>/health`，应返回 `{"code":0,"message":"ok","data":{"time":...}}`

---

## 方案二：事件函数 + 专享版 APIG（备选，需付费实例）

若你已有/愿购买专享版 APIG 实例，可用事件函数 + `huawei-handler.js` 适配器（代码零改动）：

1. 创建**事件函数**（Node.js 18），上传含 `huawei-handler.js` 的 zip
2. 代码页处理程序填 `huawei-handler.handler`
3. 环境变量：`FUNCTIONGRAPH`=1、`PORT`=8000、`SIGN_SECRET`=随机串、`PUBLIC_BASE` 先空
4. **API 网关控制台**购买专享版实例（最小「基础版」即可，按需计费测试可即开即停）+ 绑定弹性公网 IP
5. 函数触发器选 APIG：实例=你的专享实例、分组=新建（如 `video-parse-group`）、
   发布环境=RELEASE、请求路径=`/video-parse-server`、安全认证=NONE
6. 回填 `PUBLIC_BASE`=<触发器调用 URL>、保存、验证 `/health`

---

## 安卓端接入

```bash
flutter run --dart-define=BASE_URL=<访问URL，去掉末尾 /health>
```

例如 `BASE_URL=https://xxxx.apigf.cn-north-4.myhuaweicloud.com/video-parse-server`

---

## 常见问题

- **/health 返回 404**：确认 `PUBLIC_BASE` 路径与访问 URL 一致；`/` 和 `/favicon` 返回 404 是正常的（服务端没有这两个路由）
- **HTTP 函数启动失败 / 一直 500**：确认环境变量 `HOST=127.0.0.1`、`PORT=8000`，且**未设** `FUNCTIONGRAPH`（设了会让 src/index.js 不 listen）
- **解析拉不到数据**：确认「函数访问公网」已开启（否则函数内无法访问抖音/小红书等外网）
- **免费额度**：FunctionGraph 每月 100 万次调用 + 40 万 GB·秒，个人解析服务绰绰有余
