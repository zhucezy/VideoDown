import 'package:flutter/material.dart';
import '../utils/config.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('使用说明', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text(
            '1. 复制各平台分享链接\n'
            '2. 回到首页自动/手动粘贴\n'
            '3. 点击解析，选择清晰度或勾选图片\n'
            '4. 保存到相册',
          ),
          const SizedBox(height: 16),
          const Text('免责声明', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text(
            '本工具仅用于保存您拥有版权或已获授权的个人素材，请遵守各平台'
            '服务条款与相关法律法规，勿用于侵权用途。',
          ),
          const SizedBox(height: 16),
          ListTile(
            title: const Text('服务端地址'),
            subtitle: Text(kApiBaseUrl),
            dense: true,
          ),
        ],
      ),
    );
  }
}
