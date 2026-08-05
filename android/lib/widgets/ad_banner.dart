import 'package:flutter/material.dart';
import '../utils/config.dart';

/// 顶部广告位
/// 高度随素材自适应；无填充（_adLoaded=false 或关闭）时整块收起为 0 高度。
/// 当前为占位实现，接入 AdMob 时把占位 body 替换为 AdWidget 即可，
/// 并由广告回调控制 _adLoaded（加载失败 => SizedBox.shrink 收起）。
class AdBanner extends StatefulWidget {
  const AdBanner({super.key});

  @override
  State<AdBanner> createState() => _AdBannerState();
}

class _AdBannerState extends State<AdBanner> {
  // 占位：真实接入广告 SDK 后由 onAdFailedToLoad 置 false
  bool _adLoaded = true;

  @override
  Widget build(BuildContext context) {
    if (!kEnableAd || !_adLoaded) return const SizedBox.shrink();

    // 高度由内容自适应，不设死高度
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.shade200),
      ),
      child: const Row(
        children: [
          Icon(Icons.campaign_outlined, color: Colors.amber, size: 18),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              '广告位 · 高度自适应（接入 AdMob 后由素材尺寸撑开）',
              style: TextStyle(fontSize: 12, color: Colors.amber),
            ),
          ),
        ],
      ),
    );
  }
}
