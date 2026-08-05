import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// 支持平台图标墙（首页展示）
class PlatformGrid extends StatelessWidget {
  final List<PlatformInfo> platforms;
  final ValueChanged<String>? onTap; // 点击平台 -> 把示例提示回填（这里仅做视觉反馈）

  const PlatformGrid({super.key, required this.platforms, this.onTap});

  @override
  Widget build(BuildContext context) {
    if (platforms.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 14,
      runSpacing: 14,
      children: platforms.map((p) {
        final color = _parseColor(p.color);
        return InkWell(
          onTap: () => onTap?.call(p.key),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    p.name.isNotEmpty ? p.name[0] : '?',
                    style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 20),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(p.name, style: const TextStyle(fontSize: 11, color: Colors.black87)),
            ],
          ),
        );
      }).toList(),
    );
  }

  Color _parseColor(String hex) {
    try {
      return Color(int.parse(hex.replaceFirst('#', '0xff')));
    } catch (_) {
      return Colors.blue;
    }
  }
}
