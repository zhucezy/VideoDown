import 'package:flutter/material.dart';
import '../models/parse_result.dart';

/// 解析结果卡片：封面 + 标题 + 平台/类型角标 + 清晰度选择 + 图片多选 + 保存
class ResultCard extends StatefulWidget {
  final ParseResult result;
  final Future<void> Function(Quality quality) onSaveVideo;
  final Future<void> Function(List<String> originUrls, Map<String, String> headers)
      onSaveImages;
  final VoidCallback? onPreview;

  const ResultCard({
    super.key,
    required this.result,
    required this.onSaveVideo,
    required this.onSaveImages,
    this.onPreview,
  });

  @override
  State<ResultCard> createState() => _ResultCardState();
}

class _ResultCardState extends State<ResultCard> {
  int _qualityIndex = 0;
  final Set<int> _selectedImages = {};
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // 默认全选图片（纯图片页一键保存更顺手）
    if (widget.result.hasImages) {
      _selectedImages.addAll(List.generate(widget.result.images.length, (i) => i));
    }
  }

  void _toggleImage(int i) {
    setState(() {
      if (_selectedImages.contains(i)) {
        _selectedImages.remove(i);
      } else {
        _selectedImages.add(i);
      }
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    try {
      if (widget.result.hasVideo) {
        await widget.onSaveVideo(widget.result.qualities[_qualityIndex]);
      }
      final urls =
          _selectedImages.map((i) => widget.result.images[i].originUrl).toList();
      if (urls.isNotEmpty) {
        await widget.onSaveImages(urls, widget.result.proxyHeaders);
      }
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('已保存到相册')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存失败：$e')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.result;
    return Card(
      margin: const EdgeInsets.all(16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (r.cover.isNotEmpty)
            GestureDetector(
              onTap: widget.onPreview,
              child: ClipRRect(
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(16)),
                child: Image.network(
                  r.cover,
                  height: 200,
                  width: double.infinity,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    height: 200,
                    color: Colors.grey.shade200,
                    child: const Icon(Icons.broken_image),
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(r.platformName,
                        style: const TextStyle(fontSize: 12, color: Colors.blue)),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(_typeLabel(r.contentType),
                        style: const TextStyle(fontSize: 12, color: Colors.green)),
                  ),
                ]),
                const SizedBox(height: 8),
                Text(
                  r.title.isEmpty ? '未命名作品' : r.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
                ),
                if (r.author.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('@${r.author}',
                        style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ),
                const SizedBox(height: 12),
                if (r.hasVideo) ...[
                  const Text('清晰度（默认最高）',
                      style: TextStyle(fontSize: 13, color: Colors.grey)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: r.qualities.asMap().entries.map((e) {
                      final i = e.key;
                      final q = e.value;
                      final selected = i == _qualityIndex;
                      return ChoiceChip(
                        label: Text(q.label + (i == 0 ? ' · 最高' : '')),
                        selected: selected,
                        onSelected: (_) => setState(() => _qualityIndex = i),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                ],
                if (r.hasImages) ...[
                  Row(children: [
                    const Text('图片',
                        style: TextStyle(fontSize: 13, color: Colors.grey)),
                    const Spacer(),
                    TextButton(
                      onPressed: () => setState(() {
                        if (_selectedImages.length == r.images.length) {
                          _selectedImages.clear();
                        } else {
                          _selectedImages.addAll(
                              List.generate(r.images.length, (i) => i));
                        }
                      }),
                      child: Text(_selectedImages.length == r.images.length
                          ? '取消全选'
                          : '全选'),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                      childAspectRatio: 1,
                    ),
                    itemCount: r.images.length,
                    itemBuilder: (ctx, i) {
                      final selected = _selectedImages.contains(i);
                      return GestureDetector(
                        onTap: () => _toggleImage(i),
                        child: Stack(children: [
                          Positioned.fill(
                            child: Image.network(
                              r.images[i].url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) =>
                                  Container(color: Colors.grey.shade200),
                            ),
                          ),
                          if (selected)
                            Positioned(
                              top: 4,
                              right: 4,
                              child: Container(
                                decoration: const BoxDecoration(
                                    color: Colors.blue, shape: BoxShape.circle),
                                child: const Icon(Icons.check,
                                    color: Colors.white, size: 16),
                              ),
                            ),
                        ]),
                      );
                    },
                  ),
                  const SizedBox(height: 12),
                ],
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _saving ? null : _save,
                    icon: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.download),
                    label: Text(_saveLabel(r, _selectedImages.length)),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      backgroundColor: Colors.blue,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _typeLabel(String ct) {
    switch (ct) {
      case 'image':
        return '图片';
      case 'mixed':
        return '图文';
      default:
        return '视频';
    }
  }

  String _saveLabel(ParseResult r, int sel) {
    if (r.hasVideo && !r.hasImages) return '保存无水印视频';
    if (!r.hasVideo && r.hasImages) {
      return sel > 0 ? '保存选中图片($sel)' : '保存图片(${r.images.length})';
    }
    return '保存视频+选中图片';
  }
}
