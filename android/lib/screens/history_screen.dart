import 'package:flutter/material.dart';
import '../services/history_storage.dart';
import '../services/download_service.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<HistoryItem> _items = [];
  final _dl = DownloadService();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    _items = await HistoryStore.loadAll();
    if (mounted) setState(() {});
  }

  Future<void> _clear() async {
    await HistoryStore.clear();
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('历史记录'),
        actions: [
          TextButton(onPressed: _clear, child: const Text('清空')),
        ],
      ),
      body: _items.isEmpty
          ? const Center(child: Text('暂无记录'))
          : ListView(
              children: _items
                  .map((it) => _ItemCard(
                        item: it,
                        onChanged: _load,
                        dl: _dl,
                      ))
                  .toList(),
            ),
    );
  }
}

class _ItemCard extends StatelessWidget {
  final HistoryItem item;
  final VoidCallback onChanged;
  final DownloadService dl;

  const _ItemCard({
    required this.item,
    required this.onChanged,
    required this.dl,
  });

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: Key(item.id),
      direction: DismissDirection.endToStart,
      onDismissed: (_) async {
        await HistoryStore.remove(item.id);
        onChanged();
      },
      background: const ColoredBox(
        color: Colors.red,
        child: Align(
          alignment: Alignment.centerRight,
          child: Padding(
            padding: EdgeInsets.only(right: 20),
            child: Icon(Icons.delete, color: Colors.white),
          ),
        ),
      ),
      child: ListTile(
        leading: item.cover.isNotEmpty
            ? Image.network(item.cover,
                width: 56, height: 56, fit: BoxFit.cover)
            : const Icon(Icons.video_file),
        title: Text(
          item.title.isEmpty ? '未命名' : item.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${item.platformName} · ${_typeLabel(item.contentType)}',
          style: const TextStyle(fontSize: 12),
        ),
        trailing: IconButton(
          icon: const Icon(Icons.download),
          onPressed: () async {
            if (item.qualities.isNotEmpty) {
              await dl.saveVideo(item.qualities.first);
            }
          },
        ),
      ),
    );
  }

  String _typeLabel(String ct) =>
      ct == 'image' ? '图片' : ct == 'mixed' ? '图文' : '视频';
}
