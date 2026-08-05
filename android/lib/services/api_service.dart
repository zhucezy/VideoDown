import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/config.dart';
import '../models/parse_result.dart';

/// 调用 ../server 的 REST 接口
class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

class PlatformInfo {
  final String key;
  final String name;
  final String color;
  final String icon;
  PlatformInfo({required this.key, required this.name, required this.color, required this.icon});

  factory PlatformInfo.fromJson(Map<String, dynamic> json) => PlatformInfo(
        key: json['key']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        color: json['color']?.toString() ?? '#5B6270',
        icon: json['icon']?.toString() ?? '',
      );
}

class ApiService {
  static const _timeout = Duration(seconds: 30);

  /// 解析视频/图片链接
  Future<ParseResult> parse(String inputUrl) async {
    final uri = Uri.parse('$kApiBaseUrl/api/parse');
    try {
      final resp = await http
          .post(
            uri,
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'url': inputUrl}),
          )
          .timeout(_timeout);
      final json = jsonDecode(resp.body) as Map<String, dynamic>;
      if (json['code'] != 0) {
        throw ApiException(json['message']?.toString() ?? '解析失败');
      }
      return ParseResult.fromJson(json);
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException('网络请求失败，请检查服务端地址或网络：$e');
    }
  }

  /// 支持的平台列表（用于首页图标墙）
  Future<List<PlatformInfo>> platforms() async {
    final uri = Uri.parse('$kApiBaseUrl/api/platforms');
    try {
      final resp = await http.get(uri).timeout(_timeout);
      final json = jsonDecode(resp.body) as Map<String, dynamic>;
      if (json['code'] != 0) return [];
      final list = json['data']?['platforms'] as List? ?? [];
      return list.map((e) => PlatformInfo.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  /// 健康检查
  Future<bool> health() async {
    try {
      final resp = await http.get(Uri.parse('$kApiBaseUrl/health')).timeout(const Duration(seconds: 5));
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
