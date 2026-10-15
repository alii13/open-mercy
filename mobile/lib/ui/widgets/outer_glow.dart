// CSS box-shadow paints only OUTSIDE the element's border box; Flutter's
// BoxShadow is a blurred shape behind the whole box, so it shows through a
// transparent interior. OuterGlow paints the shadows and clears the inside,
// matching the browser on see-through elements (pills, rings, card halos).

import 'package:flutter/widgets.dart';

class OuterGlow extends StatelessWidget {
  const OuterGlow({super.key, required this.radius, required this.shadows, required this.child});

  final BorderRadius radius;
  final List<BoxShadow> shadows;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Always the same wrapper, even with no shadows, so a glow turning on or
    // off never remounts the child.
    return CustomPaint(painter: _OuterShadowPainter(radius, shadows), child: child);
  }
}

class _OuterShadowPainter extends CustomPainter {
  _OuterShadowPainter(this.radius, this.shadows);

  final BorderRadius radius;
  final List<BoxShadow> shadows;

  @override
  void paint(Canvas canvas, Size size) {
    if (shadows.isEmpty) return;
    final rect = Offset.zero & size;
    final rrect = radius.toRRect(rect);
    var reach = 0.0;
    for (final s in shadows) {
      final r = s.blurRadius + s.spreadRadius.abs() + s.offset.distance;
      if (r > reach) reach = r;
    }
    canvas.saveLayer(rect.inflate(reach * 2 + 2), Paint());
    for (final s in shadows) {
      canvas.drawRRect(
        rrect.shift(s.offset).inflate(s.spreadRadius),
        Paint()
          ..color = s.color
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, s.blurSigma),
      );
    }
    canvas.drawRRect(rrect, Paint()..blendMode = BlendMode.clear);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _OuterShadowPainter old) => old.radius != radius || !_same(old.shadows, shadows);

  static bool _same(List<BoxShadow> a, List<BoxShadow> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
