# 华为云部署指南（视频解析服务）

适用：服务端只做 `/api/parse` 轻量解析，安卓端用 Dio 直连源站下载（不经过服务端转发大文件）。
华为云是国内节点，端点免备案、SNI 干净、手机直连秒通，从根上绕开 `vercel.app` 的 DNS 污染 + SNI-RST 封锁。

---

## ⚠️ 关键背景：FunctionGraph 公网访问现在要付费

经核实华为云官方文档（2025-04-30 起）：

- **API 网关共享版已退市**，新用户只能用**专享版（付费，需购买实例）**。
- **无论是 HTTP 函数还是事件函数，要拿到公网 HTTP 调用 URL，都必须建 APIG 触发器**；而 APIG 现在只有专享版可用 → **有费用**。
- 官方最佳实践明确把「API 网关 APIG 专享版」标为 FunctionGraph 对外暴露的**「必须」**项。

**结论：FunctionGraph 这条路已经没有"免费公网"了。** 想零费用，请走下面的 ECS 路线。

---

## 路线 A（推荐，免费）：ECS 公网 IP 直接跑 Node

标准 Express 代码**零改动**，直接 `npm start` 跑在 ECS 上，用公网 IP + 高位端口访问。
**裸公网 IP（不绑域名）不需要 ICP 备案**，国内手机直连秒通。

### 1. 服务端准备（零改动）
代码就是现有的 `server/`，`npm install` 后 `node src/index.js` 监听 `PORT`（默认 3000）。
`PORT` / `HOST` / `SIGN_SECRET` / `PUBLIC_BASE` 用环境变量或 `.env` 注入。

### 2. ECS 上启动
```bash
# 安装依赖
cd /opt/video-parse/server && npm install --production

# 用 pm2 守护（推荐）
npm i -g pm2
PORT=8000 SIGN_SECRET='你的随机串' PUBLIC_BASE='http://<ECS公网IP>:8000' pm2 start src/index.js --name video-parse
pm2 save && pm2 startup   # 开机自启
```

### 3. 安全组 / 防火墙
ECS 安全组**入方向**放通 TCP `8000` 端口（源 `0.0.0.0/0`）。
若用云防火墙/系统防火墙（firewalld/ufw）同样放通 8000。

### 4. 验证
浏览器 / 手机访问 `http://<ECS公网IP>:8000/health`，返回 `{"code":0,...}` 即成功。

### 5. 安卓接入
```bash
flutter run --dart-define=BASE_URL=http://<ECS公网IP>:8000
```

> 后续若想用域名 + HTTPS，需把域名 ICP 备案后解析到 ECS 公网 IP，再上 Nginx 反代 + 证书。当前裸 IP:port 已可用。

---

## 路线 B（付费）：FunctionGraph + 专享版 APIG

仅在你愿意为 APIG 专享版实例付费时选此路。

### 方案 B1：HTTP 函数（需 APIG 专享版触发器）
1. 创建** HTTP 函数**（Node.js 18），上传含 `bootstrap`（`node src/index.js`）的 zip
2. 高级设置 → **函数访问公网：开启**
3. 环境变量：`HOST=127.0.0.1`、`PORT=8000`、`SIGN_SECRET`=随机串、`PUBLIC_BASE` 先空
   - ⚠️ 不要设 `FUNCTIONGRAPH`
4. **APIG 控制台购买专享版实例**（最小规格，按需计费可即开即停）→ 绑定弹性公网 IP
5. 函数 → 设置/配置 → 触发器 → 建 **APIG 专享版**触发器（安全认证 NONE、发布环境 RELEASE）
6. 复制调用 URL → 回填 `PUBLIC_BASE` → 访问 `<URL>/health` 验证

### 方案 B2：事件函数 + 适配器（需 APIG 专享版触发器）
1. 创建**事件函数**（Node.js 18），上传含 `huawei-handler.js` 的 zip
2. 代码页处理程序填 `huawei-handler.handler`
3. 环境变量：`FUNCTIONGRAPH=1`、`PORT=8000`、`SIGN_SECRET`=随机串、`PUBLIC_BASE` 先空
4. 购买 APIG 专享版实例 + 建触发器（同 B1 第 4-6 步）

---

## 踩坑记录（实测）

- **事件函数触发器在「设置 → 触发器」，HTTP 函数在「配置 → 触发器」**——位置不同，可据此判断函数类型。
- **「普通触发器」灰色** = APIG 共享版已退市，正常现象；只能选专享版（需先买实例）。
- **「OBS 应用事件源」触发器是事件源触发器**（OBS 桶文件变动触发函数），**与 HTTP 接口访问无关，别建**。
- HTTP 函数固定 `HOST=127.0.0.1` + `PORT=8000`，响应体上限 6MB（解析接口远小于此，够用）。

## 免费额度参考
- FunctionGraph：每月 100 万次调用 + 40 万 GB·秒（但公网暴露仍需付费 APIG）。
- ECS：测试账号通常带试用额度；裸 IP:port 无备案成本。
