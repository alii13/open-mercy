// RollingNumber.vue - an odometer: each digit column slides its 0-9 strip to
// the right digit, and the whole number punches to 1.28x on every change.

import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/settings_store.dart';
import '../theme.dart';

class RollingNumber extends StatefulWidget {
  const RollingNumber({super.key, required this.value, required this.style});

  final int value;
  final TextStyle style;

  @override
  State<RollingNumber> createState() => _RollingNumberState();
}

class _RollingNumberState extends State<RollingNumber> {
  bool _bumped = false;
  Timer? _bumpTimer;

  @override
  void didUpdateWidget(covariant RollingNumber oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _bumpTimer?.cancel();
      setState(() => _bumped = true);
      _bumpTimer = Timer(const Duration(milliseconds: 260), () {
        if (mounted) setState(() => _bumped = false);
      });
    }
  }

  @override
  void dispose() {
    _bumpTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduced = motionReduced;
    final digits = widget.value.clamp(0, 1 << 31).toString().split('').map(int.parse).toList();
    final size = widget.style.fontSize ?? 14;
    return AnimatedScale(
      scale: _bumped && !reduced ? 1.28 : 1,
      duration: const Duration(milliseconds: 180),
      curve: OmMotion.easeBounce,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (i, d) in digits.indexed)
            _DigitColumn(key: ValueKey('${digits.length}-$i'), digit: d, style: widget.style, size: size, reduced: reduced),
        ],
      ),
    );
  }
}

class _DigitColumn extends StatelessWidget {
  const _DigitColumn({super.key, required this.digit, required this.style, required this.size, required this.reduced});

  final int digit;
  final TextStyle style;
  final double size;
  final bool reduced;

  @override
  Widget build(BuildContext context) {
    // Column width = widest digit, so tabular figures stay put while rolling.
    final tp = TextPainter(
      text: TextSpan(text: '0', style: style.copyWith(height: 1)),
      textDirection: TextDirection.ltr,
    )..layout();
    final w = tp.width;
    return SizedBox(
      width: w,
      height: size,
      child: ClipRect(
        child: OverflowBox(
          alignment: Alignment.topCenter,
          maxHeight: size * 10,
          child: TweenAnimationBuilder<double>(
            tween: Tween(end: digit.toDouble()),
            duration: reduced ? Duration.zero : const Duration(milliseconds: 340),
            curve: const Cubic(0.22, 1, 0.36, 1),
            builder: (context, v, child) => Transform.translate(offset: Offset(0, -v * size), child: child),
            child: Column(
              children: [
                for (var n = 0; n < 10; n++)
                  SizedBox(
                    height: size,
                    child: Center(child: Text('$n', style: style.copyWith(height: 1))),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
