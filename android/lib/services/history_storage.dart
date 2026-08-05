import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/parse_result.dart';

class HistoryItem {
  final String id;
  final String sourceUrl;
  final String platformName;
  final String title;
  final String cover;
  final String contentType;
  final List<String> qualities; // 保存的视频直链
  final int savedAt;

  HistoryItem({
    required this.id,
    required this.sourceUrl,
    required this.platformName,
    required this.title,
    required this.cover,
    required this.contentType,
    required this.qualities,
    required this.savedAt,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'sourceUrl': sourceUrl,
        'platformName': platformName,
        'title': title,
        'cover': cover,
        'contentType': contentType,
        'qualities': qualities,
        'savedAt': savedAt,
      };

  factory HistoryItem.fromJson(Map<String, dynamic> j) => HistoryItem(
        id: j['id']?.toString() ?? '',
        sourceUrl: j['sourceUrl']?.toString() ?? '',
        platformName: j['platformName']?.toString() ?? '',
        title: j['title']?.toString() ?? '',
        cover: j['cover']?.toString() ?? '',
        contentType: j['contentType']?.toString() ?? 'video',
        qualities: List<String>.from(j['qualities'] ?? []),
        savedAt: j['savedAt'] is int ? j['savedAt'] : 0,
      );
}

class HistoryStore {
  static const _key = 'videodown_history';
  static List<HistoryItem> _cache = [];

  static Future<void> add(ParseResult r, String url) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_key) ?? [];
    final item = HistoryItem(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      sourceUrl: url,
      platformName: r.platformName,
      title: r.title,
      cover: r.cover,
      contentType: r.contentType,
      qualities: r.qualities.map((q) => q.url).toList(),
      savedAt: DateTime.now().millisecondsSinceEpoch,
    );
    list.insert(0, jsonEncode(item.toJson()));
    await prefs.setStringList(_key, list.take(100).toList());
    _cache = list.map((e) => HistoryItem.fromJson(jsonDecode(e))).toList();
  }

  static List<HistoryItem> list() => _cache;

  static Future<List<HistoryItem>> loadAll() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_key) ?? [];
    _cache = list.map((e) => HistoryItem.fromJson(jsonDecode(e))).toList();
    return _cache;
  }

  static Future<void> remove(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_key) ?? [];
    list.removeWhere((e) => HistoryItem.fromJson(jsonDecode(e)).id == id);
    await prefs.setStringList(_key, list);
    _cache = list.map((e) => HistoryItem.fromJson(jsonDecode(e))).toList();
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    _cache = [];
  }
}
