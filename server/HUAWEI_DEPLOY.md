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

> ⚠️ 华为云「创建空白函数」的基础信息表单通常只有：区域、函数名称、委托、运行时等几项，
> **没有 Handler 字段、也没有代码上传入口**，这是正常的。Handler 要在创建成功后进入函数详情的「代码」页设置。

1. **函数工作流** → **创建函数** → 选「事件函数」→「空白函数 / 从零开始创建」
2. 基础信息就填你看到的这 4 项：
   - 区域：北京四（cn-north-4）
   - 函数名称：`video-parse-server`（自取，记住它，APIG 路径里会用到）
   - 委托：留空（不需要 IAM 角色）
   - 运行时：Node.js 18（你看到的 18.15 等同）
3. 点「创建函数」，会自动进入函数详情页（或到函数列表点进去）
4. 进函数详情 **「代码」标签**：
   - 代码输入方式选「**上传 ZIP 文件**」
   - 上传本机打好的 `video-parse-deploy.zip`
   - 上传后页面出现「**处理程序（Handler）**」输入框，默认是 `index.handler`
     → **必须改成 `huawei-handler.handler`**（否则找不到入口会报错）
   - 内存：256 MB（解析峰值约 200–300MB，可选 512 留余量）
   - 超时：30 秒
   - 点「保存 / 部署」
5. **设置环境变量**（「配置」标签 → 环境变量）：
   - `FUNCTIONGRAPH` = `1`（关键：让 src/index.js 不自己 listen，改用回环 server）
   - `PORT` = `8000`
   - `SIGN_SECRET` = 任意随机复杂串（如 `vD9#mP2$kQ7xZ`）
   - `PUBLIC_BASE` = 先空着，建好 APIG 触发器后回填（见下）
   - 点「保存」

## 三、创建 APIG HTTP 触发器

1. 进函数详情 → **触发器** → **创建触发器**
2. 触发器类型：`APIG`（API 网关）
3. 填写以下字段（控制台此处通常要求填 4 项）：
   - **实例**：选一个 APIG 实例。若下拉为空，需先到「API 网关」控制台创建一个**共享版**实例（有免费额度），或本页若有「新建实例」按钮直接新建；个人用共享版即可，不必用专享版
   - **分组**：API 分组（API 的容器）。没有就点「新建分组」，名称任意（如 `video-parse-group`）
   - **发布环境**：选 `RELEASE`（默认发布环境，创建函数时已自动带有）
   - **请求路径**：填 `/video-parse-server`（与函数名一致便于记忆，即函数对外暴露的路径）
   - 安全认证：`NONE`（免鉴权，公开访问）
4. 点「创建」
5. 创建完成后，触发器列表 / APIG 控制台会给出**完整调用 URL**，形如：
   ```
   https://<分组子域>.apigw.<区域>.myhuaweicloud.com/<发布环境>/<请求路径>
   ```
   例如 `https://abc123.apigw.cn-north-4.myhuaweicloud.com/RELEASE/video-parse-server`
   记下这个 URL（它就是安卓端 `BASE_URL` 和 `PUBLIC_BASE` 要填的值）

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
