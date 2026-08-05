# VideoDown Android（Flutter 客户端 + Railway 服务端）

安卓 APP 版的视频/图片无水印解析下载工具。前端用 **Flutter**，服务端复用 `../server/` 的 Node.js Express（8 平台适配器 + HMAC 签名代理），部署到 **Railway**。

需求与决策总结见 [`REQUIREMENTS.md`](./REQUIREMENTS.md)。

---

## 一、目录结构

```
VideoDown/
├── server/            # Node 解析服务端（原样复用，部署到 Railway）
│   ├── railway.json   # ★ Railway 部署配置（已加）
│   └── src/           # 8 平台适配器 + 代理中转
└── android/           # Flutter 安卓客户端（本项目）
    ├── lib/
    │   ├── main.dart
    │   ├── models/parse_result.dart
    │   ├── services/   # api_service / download_service / history_storage
    │   ├── widgets/    # ad_banner / platform_grid / result_card
    │   ├── screens/    # home / history / settings
    │   └── utils/config.dart   # kApiBaseUrl（服务端地址）
    ├── android/app/src/main/AndroidManifest.xml  # 已加存储权限
    ├── pubspec.yaml
    └── REQUIREMENTS.md
```

> 服务端代码**零改动**即可部署；客户端只调它的 REST 接口。

---

## 二、本地前置依赖

- **Flutter SDK**（≥ 3.2）+ **Android SDK**（编译 APK 用）
- **Node.js**（本机联调服务端用）
- **Railway 账号**（部署服务端用，见第五节；需你自己的邮箱 + 免费层绑卡）

---

## 三、初始化安卓原生层

Dart 代码已就绪。若 `android/` 原生层不完整，在本目录运行：

```bash
cd android
flutter create --platform=android .
```

这会用默认原生骨架补齐 `android/` 下缺失文件（gradle、MainActivity、res 等）。
我们已提供的 `AndroidManifest.xml` 含存储权限，会被保留/覆盖。

安装依赖：

```bash
flutter pub get
```

---

## 四、配置服务端地址

客户端通过编译参数注入地址（不写死）：

```bash
# 连 Railway 生产地址
flutter run --dart-define=BASE_URL=https://你的项目.up.railway.app

# 本机联调（先 cd ../server && npm install && npm start）
flutter run --dart-define=BASE_URL=http://192.168.1.10:3000
```

`lib/utils/config.dart` 的 `kApiBaseUrl` 默认值也可直接改成真实地址。

---

## 五、部署服务端到 Railway（关键）

> ⚠️ **关于"申请免费主机"**：Railway 账号**需要你用自己的邮箱注册**（免费层要绑信用卡做 $5 额度验证），我无法替你注册。下面把你做完的部分（配置 + 命令）都备好了，你只需在网页点几下或跑一条命令。

### 方式 A：Railway 网页（最省事）
1. 打开 https://railway.app 注册/登录
2. New Project → **Deploy from GitHub**（推荐把 VideoDown 推到你的 GitHub 仓库）→ 选 `server/` 目录
   - 或选 "Deploy from CLI / Empty Project" 后手动上传 `server/`
3. 环境变量 Railway 已通过 `railway.json` 自动注入 `PUBLIC_BASE=https://${{RAILWAY_PUBLIC_DOMAIN}}`；如需改默认值，在面板 Variables 覆盖
4. 部署完成后，Railway 给出 `https://xxx.up.railway.app`，把它填到客户端的 `BASE_URL`

### 方式 B：Railway CLI
```bash
npm i -g @railway/cli
railway login          # 浏览器授权（需你的账号）
cd server
railway link           # 关联/新建项目
railway up             # 一键部署
railway domain         # 查看分配的域名
```

`railway.json` 已配置：`nixpacks` 自动构建、`node src/index.js` 启动、`/health` 健康检查、注入 `PUBLIC_BASE` 与 `HOST=0.0.0.0`。

---

## 六、运行与构建

```bash
# 真机/模拟器调试
flutter run --dart-define=BASE_URL=https://xxx.up.railway.app

# 打 release APK（可侧载分发，绕过应用商店）
flutter build apk --release --dart-define=BASE_URL=https://xxx.up.railway.app
# 产物：build/app/outputs/flutter-apk/app-release.apk
```

APK 直接发给朋友安装即可（安卓不查备案、不查域名白名单）。

---

## 七、已知约束

- **视频号**：仅支持粘贴 `finder.video.qq.com` 直链，分享页无法解析。
- **平台风控**：解析逻辑留在服务端，客户端只请求你的 Railway 域名。
- **kesug.com**：挂在 InfinityFree（PHP 主机）跑不了 Node，本方案不使用它；Railway 自带域名即够用。
- **合规**：定位"个人素材管理工具"，含免责声明；主流应用商店上架难，APK 侧载更现实。
