import 'package:flutter/material.dart';
import 'package:clipboard/clipboard.dart';
import '../utils/config.dart';
import '../services/api_service.dart';
import '../services/download_service.dart';
import '../services/history_storage.dart';
import '../widgets/ad_banner.dart';
import '../widgets/platform_grid.dart';
import '../widgets/result_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _api = ApiService();
  final _dl = DownloadService();
  final _ctrl = TextEditingController();
  ParseResult? _result;
  bool _loading = false;
  String? _error;
  List<PlatformInfo> _platforms = [];

  @override
  void initState() {
    super.initState();
    _api.platforms().then((p) => mounted ? setState(() => _platforms = p) : null);
    _tryClipboard();
  }

  Future<void> _tryClipboard() async {
    try {
      final text = await FlutterClipboard.paste();
      if (text.contains('http') && _ctrl.text.isEmpty) {
        setState(() => _ctrl.text = text.trim());
      }
    } catch (_) {}
  }

  Future<void> _parse() async {
    final url = _ctrl.text.trim();
    if (url.isEmpty) {
      setState(() => _error = '请先粘贴视频/图片链接');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _result = null;
    });
    try {
      final r = await _api.parse(url);
      await HistoryStore.add(r, url);
      setState(() => _result = r);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          children: [
            _Header(),
            const AdBanner(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _ctrl,
                    decoration: InputDecoration(
                      hintText: '粘贴视频/图片链接',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12)),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: _ctrl.clear,
                      ),
                    ),
                    maxLines: 2,
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _loading ? null : _parse,
                      child: _loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white))
                          : const Text('解析'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text(_error!,
                          style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ),
                  const SizedBox(height: 16),
                  if (_platforms.isNotEmpty) ...[
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text('支持平台',
                          style: TextStyle(fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(height: 12),
                    PlatformGrid(platforms: _platforms),
                    const SizedBox(height: 16),
                  ],
                  const _Steps(),
                ],
              ),
            ),
            if (_result != null)
              ResultCard(
                result: _result!,
                onSaveVideo: (q) => _dl.saveVideo(q.originUrl, headers: q.proxyHeaders),
                onSaveImages: (urls, headers) =>
                    _dl.saveImages(urls, headers: headers),
                onPreview: () {},
              ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF4A90E2), Color(0xFF357ABD)],
        ),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('视频解析下载',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold)),
          SizedBox(height: 4),
          Text('粘贴链接，下载无水印原片',
              style: TextStyle(color: Colors.white70, fontSize: 13)),
        ],
      ),
    );
  }
}

class _Steps extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final steps = ['复制分享链接', '粘贴到上方', '一键解析下载'];
    return Row(
      children: steps.asMap().entries.map((e) {
        final i = e.key;
        final t = e.value;
        return Expanded(
          child: Column(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: Colors.blue.shade50,
                child: Text('${i + 1}',
                    style: const TextStyle(color: Colors.blue, fontSize: 12)),
              ),
              const SizedBox(height: 4),
              Text(t, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ],
          ),
        );
      }).toList(),
    );
  }
}
