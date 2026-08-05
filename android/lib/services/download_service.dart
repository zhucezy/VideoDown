import 'dart:io';
import 'package:dio/dio.dart';
import 'package:gallery_saver/gallery_saver.dart';
import 'package:path_provider/path_provider.dart';

/// 直连源站下载视频/图片并保存到相册
///
/// 因 Vercel 等 Serverless 平台无法做流式中转（超时/响应体限制），
/// 安卓端改为：带防盗链头（proxyHeaders）直连 originUrl 下载，绕过 CDN 防盗链
class DownloadService {
  final Dio _dio = Dio();

  /// 直连源站下载视频并保存到相册
  /// [originUrl] 原始直链，[headers] 防盗链头（Referer/User-Agent 等）
  Future<bool> saveVideo(String originUrl, {Map<String, String>? headers}) async {
    if (originUrl.isEmpty) return false;
    try {
      final dir = await getTemporaryDirectory();
      final filePath =
          '${dir.path}/videodown_${DateTime.now().millisecondsSinceEpoch}.mp4';
      await _dio.download(
        originUrl,
        filePath,
        options: Options(headers: headers ?? const {}),
      );
      final result = await GallerySaver.saveVideo(filePath, albumName: 'VideoDown');
      return result != null && result.isNotEmpty;
    } catch (e) {
      return false;
    }
  }

  /// 直连源站下载图片并保存到相册
  Future<bool> saveImage(String originUrl, {Map<String, String>? headers}) async {
    if (originUrl.isEmpty) return false;
    try {
      final dir = await getTemporaryDirectory();
      final filePath =
          '${dir.path}/videodown_${DateTime.now().millisecondsSinceEpoch}.jpg';
      await _dio.download(
        originUrl,
        filePath,
        options: Options(headers: headers ?? const {}),
      );
      final result = await GallerySaver.saveImage(filePath, albumName: 'VideoDown');
      return result != null && result.isNotEmpty;
    } catch (e) {
      return false;
    }
  }

  /// 批量保存图片
  Future<List<bool>> saveImages(List<String> originUrls,
      {Map<String, String>? headers}) async {
    final results = <bool>[];
    for (final u in originUrls) {
      results.add(await saveImage(u, headers: headers));
    }
    return results;
  }
}
