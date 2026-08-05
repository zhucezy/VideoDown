# 本机联调指南（Local Debug）

把 `VideoDown` 在**你自己的电脑**上跑起来，用微信开发者工具直连调试，无需任何服务器/域名/备案。
适合：先看效果、联调接口、验证解析与下载流程。

> 前置条件：电脑已装 Node.js（≥18）。命令行能执行 `node -v`。

---

## 一、启动解析服务（后端）

```bash
cd server
npm install          # 首次需要，已装过可跳过
npm start            # 或 npm run dev（改代码自动重启）
```

看到如下日志即启动成功：

```
视频解析服务已启动
监听地址: http://0.0.0.0:3000
对外地址: http://127.0.0.1:3000
已注册平台: 抖音、微博、小红书、即梦、快手、B站、视频号、通用
```

> 端口/地址都在 `server/.env` 里改。`.env` 已被 `.gitignore` 忽略，不会进仓库。

---

## 二、配置小程序指向本地

文件 `miniprogram/utils/config.js` 已默认 `ENV = 'dev'`，`baseUrl` 指向 `http://127.0.0.1:3000`。
**只要服务在本地 3000 端口，`config.js` 不用改。**

⚠️ 关键对齐：`config.js` 的 `dev.baseUrl` 必须等于 `server/.env` 的 `PUBLIC_BASE`，
否则解析出来的下载直链地址对不上，会下载失败。

| 调试方式 | dev.baseUrl | PUBLIC_BASE |
|---|---|---|
| 开发者工具【模拟器】 | `http://127.0.0.1:3000` | `http://127.0.0.1:3000` |
| 【真机调试】 | `http://192.168.x.x:3000`（你电脑局域网 IP） | 同上，必须一致 |

> 查电脑局域网 IP：Windows 命令行 `ipconfig` 看「IPv4 地址」；Mac `ifconfig | grep inet`。

---

## 三、微信开发者工具里关掉域名校验

1. 打开微信开发者工具 → 导入项目 → 目录选 `miniprogram/`（含 `project.config.json` 的目录）。
2. 右上角「详情」→「本地设置」→ 勾选 ✅ **不校验合法域名、TLS版本以及HTTPS证书**。
3. 编译运行。

> 这一步是联调必需：本地是 `http://`，且域名未备案，不勾这个会直接 `request:fail domain not configured`。

---

## 四、开始测试

1. 首页粘贴一个抖音/小红书/微博等分享链接 → 点「解析」。
2. 正常会看到清晰度列表 / 图片网格；选最高分辨率或勾选图片 → 点保存。
3. `wx.downloadFile` 走的是本地服务的签名代理 `/api/dl`，由服务回源下载，再存到相册。

---

## 五、常见问题排查

**Q1：模拟器能跑，真机调试下载失败？**
真机上 `127.0.0.1` 指的是手机自己，不是电脑。按上表把 `dev.baseUrl` 和 `PUBLIC_BASE` 都改成电脑**局域网 IP**，并确认电脑防火墙放行 3000 端口（Windows  defender 允许 Node 通过专用网络）。

**Q2：解析一直转圈或报「解析失败」？**
服务控制台（运行 `npm start` 的窗口）会打印 `[parse fail] 平台 链接 → 原因`。多数是平台反爬/需登录态：
- 抖音、小红书、快手等部分内容需要 Cookie。在 `server/.env` 里填对应 `COOKIE_*` 后重启服务。
- 纯图片网页走通用解析，依赖页面是否公开渲染了原图地址。

**Q3：点保存提示「保存失败 / 用户取消」？**
首次保存微信会弹「保存到相册」授权，需用户允许。若之前点了拒绝，去「设置 → 隐私 → 相册」重新开启。

**Q4：广告位空白？**
`config.js` 里 `ad.bannerUnitId` 是占位的，没填真实流量主广告位就会留白（组件已做加载失败自动隐藏，不影响功能）。联调阶段可忽略。

**Q5：改了后端代码要重启吗？**
用 `npm run dev`（基于 `node --watch`）会自动重启；用 `npm start` 需手动 Ctrl+C 重启。

---

## 六、联调 OK 之后

- 想真上架微信：见 README「部署与上线」一节。个人主体无法备案服务器域名，最稳的是 **微信云托管（callContainer）** 方案。
- 切回生产：把 `miniprogram/utils/config.js` 的 `ENV` 改回 `'prod'`，填好 `prod.baseUrl`，并在微信后台配置 request / downloadFile 合法域名。

---

## 七、目录速查

```
server/.env                     本地环境变量（端口 / 地址 / 密钥 / Cookie）
server/src/index.js             服务入口（已支持 0.0.0.0 监听）
server/src/config.js            读取 .env（已集成 dotenv）
miniprogram/utils/config.js     前端环境切换（dev / prod）
```
