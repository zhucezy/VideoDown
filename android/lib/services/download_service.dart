import 'package:gallery_saver/gallery_saver.dart';

/// 保存视频/图片到相册（依赖 gallery_saver，已处理安卓权限与 scoped storage）
class DownloadService {
  /// 保存单个视频（url 为服务端签名代理直链，gallery_saver 内部下载）
  Future<bool> saveVideo(String url) async {
    if (url.isEmpty) return false;
    final result = await GallerySaver.saveVideo(url, albumName: 'VideoDown');
    return result != null && result.isNotEmpty;
  }

  /// 保存单张图片
  Future<bool> saveImage(String url) async {
    if (url.isEmpty) return false;
    final result = await GallerySaver.saveImage(url, albumName: 'VideoDown');
    return result != null && result.isNotEmpty;
  }

  /// 批量保存图片，返回每步成功与否
  Future<List<bool>> saveImages(List<String> urls) async {
    final results = <bool>[];
    for (final u in urls) {
      results.add(await saveImage(u));
    }
    return results;
  }
}
