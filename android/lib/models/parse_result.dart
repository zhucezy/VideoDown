/// 解析结果数据模型
/// 与 ../server 的 /api/parse 返回结构对齐
///
/// 下载策略（Vercel 等 Serverless 环境无法做流式中转）：
///   客户端直接用 originUrl + proxyHeaders 直连源站下载，绕过防盗链

Map<String, String> _parseHeaders(dynamic h) {
  if (h is Map) {
    return h.map((k, v) => MapEntry(k.toString(), v.toString()));
  }
  return {};
}

class Quality {
  final String label; // 如 "1080P" / "最高"
  final String url; // 已签名代理直链（Serverless 环境不可用）
  final String originUrl; // 原始直链（安卓端直连下载用）
  final String? resolution; // 如 "1920x1080"
  final int? bitrate;
  final int? size; // 字节
  final Map<String, String> proxyHeaders; // 直连源站需要的防盗链头

  const Quality({
    required this.label,
    required this.url,
    required this.originUrl,
    this.resolution,
    this.bitrate,
    this.size,
    this.proxyHeaders = const {},
  });

  factory Quality.fromJson(Map<String, dynamic> json) {
    return Quality(
      label: json['label']?.toString() ?? '未知',
      url: json['url']?.toString() ?? '',
      originUrl: json['originUrl']?.toString() ?? json['url']?.toString() ?? '',
      resolution: json['resolution']?.toString(),
      bitrate: json['bitrate'] is int ? json['bitrate'] : null,
      size: json['size'] is int ? json['size'] : null,
      proxyHeaders: _parseHeaders(json['proxyHeaders']),
    );
  }
}

class ParseImage {
  final String url; // 已签名代理直链（预览用）
  final String originUrl; // 原始直链（安卓端直连下载用）
  final int? width;
  final int? height;

  const ParseImage({
    required this.url,
    required this.originUrl,
    this.width,
    this.height,
  });

  factory ParseImage.fromJson(Map<String, dynamic> json) {
    final raw = json is String ? json : json['url']?.toString() ?? '';
    final origin = json is Map ? (json['originUrl']?.toString() ?? raw) : raw;
    return ParseImage(
      url: raw,
      originUrl: origin,
      width: json is Map ? (json['width'] is int ? json['width'] : null) : null,
      height: json is Map ? (json['height'] is int ? json['height'] : null) : null,
    );
  }
}

class ParseResult {
  final String platform;
  final String platformName;
  final String title;
  final String cover; // 已代理封面
  final String? coverDownload; // 可下载封面直链
  final String author;
  final String durationText;
  final List<Quality> qualities;
  final List<ParseImage> images;
  final String contentType; // video / image / mixed
  final Map<String, String> proxyHeaders; // 平台级防盗链头（直连用）

  const ParseResult({
    required this.platform,
    required this.platformName,
    required this.title,
    required this.cover,
    this.coverDownload,
    required this.author,
    required this.durationText,
    required this.qualities,
    required this.images,
    required this.contentType,
    this.proxyHeaders = const {},
  });

  factory ParseResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] ?? json;
    final qualities = (data['qualities'] as List? ?? [])
        .map((e) => Quality.fromJson(e as Map<String, dynamic>))
        .toList();
    final images = (data['images'] as List? ?? [])
        .map((e) => ParseImage.fromJson(e))
        .toList();

    // 内容类型推断：有视频且有图片=mixed；只有图片=image；只有视频=video
    String ct = data['contentType']?.toString() ?? '';
    if (ct.isEmpty) {
      if (images.isNotEmpty && qualities.isNotEmpty) {
        ct = 'mixed';
      } else if (images.isNotEmpty) {
        ct = 'image';
      } else {
        ct = 'video';
      }
    }

    return ParseResult(
      platform: data['platform']?.toString() ?? '',
      platformName: data['platformName']?.toString() ?? '未知平台',
      title: data['title']?.toString() ?? '',
      cover: data['cover']?.toString() ?? '',
      coverDownload: data['coverDownload']?.toString(),
      author: data['author']?.toString() ?? '',
      durationText: data['durationText']?.toString() ?? '',
      qualities: qualities,
      images: images,
      contentType: ct,
      proxyHeaders: _parseHeaders(data['proxyHeaders']),
    );
  }

  bool get hasVideo => qualities.isNotEmpty;
  bool get hasImages => images.isNotEmpty;
}
