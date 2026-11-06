// Badge.vue - the tier emblem (art rasterized from the web's SVGs), with the
// always-on foil sheen on the top two tiers and the tap tooltip.

import 'package:flutter/material.dart';

import '../../game/badges.dart';
import '../../services/settings_store.dart';
import '../theme.dart';

enum BadgeSize { mark, chip, full }

class BadgeMark extends StatefulWidget {
  const BadgeMark({super.key, required this.badge, this.size = BadgeSize.chip, this.emblemSize, this.label, this.points});

  final BadgeTier badge;
  final BadgeSize size;

  /// Overrides --emblem-size (e.g. the 30px seat avatar).
  final double? emblemSize;
  final bool? label;
  final int? points;

  @override
  State<BadgeMark> createState() => _BadgeMarkState();
}

class _BadgeMarkState extends State<BadgeMark> with SingleTickerProviderStateMixin {
  late final AnimationController _foil = AnimationController(vsync: this, duration: const Duration(milliseconds: 3400));

  bool get _isFoil => widget.badge.tier >= 9;

  @override
  void initState() {
    super.initState();
    if (_isFoil && !motionReduced) _foil.repeat(reverse: true);
  }

  @override
  void dispose() {
    _foil.dispose();
    super.dispose();
  }

  double get _emblem =>
      widget.emblemSize ??
      switch (widget.size) {
        BadgeSize.mark => 22,
        BadgeSize.chip => 24,
        BadgeSize.full => 72,
      };

  @override
  Widget build(BuildContext context) {
    final showLabel = widget.label ?? widget.size != BadgeSize.mark;
    final s = _emblem;
    final emblem = SizedBox(
      width: s,
      height: s,
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: const BoxDecoration(
                boxShadow: [BoxShadow(color: Color(0x80000000), offset: Offset(0, 1), blurRadius: 2)],
                shape: BoxShape.circle,
              ),
              child: Image.asset(widget.badge.art, fit: BoxFit.contain, filterQuality: FilterQuality.medium),
            ),
          ),
          if (_isFoil)
            Positioned.fill(
              child: AnimatedBuilder(
                animation: _foil,
                builder: (context, _) => ClipPath(
                  clipper: _ShieldClipper(),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: const Alignment(-1, -0.6),
                        end: const Alignment(1, 0.6),
                        stops: [
                          (0.3 + 1.8 * (1 - _foil.value) - 0.9).clamp(0.0, 1.0),
                          (0.5 + 1.8 * (1 - _foil.value) - 0.9).clamp(0.0, 1.0),
                          (0.7 + 1.8 * (1 - _foil.value) - 0.9).clamp(0.0, 1.0),
                        ],
                        colors: const [Color(0x00FFFFFF), Color(0xB3FFFFFF), Color(0x00FFFFFF)],
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );

    final body = widget.size == BadgeSize.full
        ? Column(mainAxisSize: MainAxisSize.min, children: [
            emblem,
            if (showLabel) ...[
              const SizedBox(height: 8),
              Text(widget.badge.title.toUpperCase(), style: monoText(13.6, color: widget.badge.color, ls: 0.16)),
            ],
          ])
        : Row(mainAxisSize: MainAxisSize.min, children: [
            emblem,
            if (showLabel) ...[
              SizedBox(width: s * 0.45),
              Text(widget.badge.title.toUpperCase(), style: monoText(9.6, color: widget.badge.color, ls: 0.12)),
            ],
          ]);

    return Tooltip(
      triggerMode: TooltipTriggerMode.longPress,
      richMessage: TextSpan(children: [
        TextSpan(text: '${widget.badge.title.toUpperCase()}\n', style: displayText(13, color: widget.badge.color, ls: 0.06)),
        TextSpan(text: 'RANK ${widget.badge.tier} OF 10', style: monoText(9.3, color: const Color(0x73FFFFFF), ls: 0.1)),
        if (widget.points != null) TextSpan(text: '\n${widget.points} points', style: monoText(11.5)),
      ]),
      decoration: BoxDecoration(
        color: const Color(0xF70B0B0D),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: widget.badge.color.withValues(alpha: 0.5)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: body,
    );
  }
}

/// The heater-shield silhouette the web clips its sheen to.
class _ShieldClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size s) => Path()
    ..moveTo(0.50 * s.width, 0.04 * s.height)
    ..lineTo(0.81 * s.width, 0.16 * s.height)
    ..lineTo(0.78 * s.width, 0.52 * s.height)
    ..lineTo(0.50 * s.width, 0.95 * s.height)
    ..lineTo(0.22 * s.width, 0.52 * s.height)
    ..lineTo(0.19 * s.width, 0.16 * s.height)
    ..close();

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}
