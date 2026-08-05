/// 服务端地址配置
///
/// 通过 `flutter run --dart-define=BASE_URL=https://xxx.up.railway.app` 覆盖。
/// 默认值是 Railway 部署后的占位地址，上线前请改为真实地址。
/// 本地联调：flutter run --dart-define=BASE_URL=http://192.168.1.10:3000
const String kApiBaseUrl = String.fromEnvironment(
  'BASE_URL',
  defaultValue: 'https://your-project.up.railway.app',
);

/// 广告位配置（流量主 / AdMob 等，按需替换）
/// 安卓端可直接集成 AdMob，此处先留接口位，由 AdBanner widget 渲染
const bool kEnableAd = true;

/// 是否开发模式（打印网络日志）
const bool kDebug = bool.fromEnvironment('DEBUG', defaultValue: false);
