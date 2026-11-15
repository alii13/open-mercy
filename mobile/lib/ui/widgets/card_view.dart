// Card.vue + CardBack.vue + the card art mapping (svgCardMapping.ts).

import 'dart:math' as math;

import 'package:flutter/material.dart' hide Card;

import '../../engine/types.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import 'outer_glow.dart';

const _numberNames = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven-swap', 'eight', 'nine'];

/// Asset for a card face - the web's getCardSVG mapping, including plain
/// wilds borrowing the roulette art (BUGS.md #2).
String cardAsset(Card card) {
  final color = card.color.name;
  final name = switch (card.type) {
    CardType.number => '${_numberNames[(card.value ?? 1).clamp(0, 9)]}-$color',
    CardType.skip => 'skip-$color',
    CardType.reverse => 'reverse-$color',
    CardType.draw2 => 'two-draw-$color',
    CardType.draw4 => 'four-draw-$color',
    CardType.skipEveryone => 'skip-everyone-$color',
    CardType.discardAll => 'discard-all-$color',
    CardType.wildReverseDraw4 => 'wild-reverse-four-draw',
    CardType.draw6 => 'wild-draw-six',
    CardType.draw10 => 'wild-ten-draw',
    CardType.wildColorRoulette || CardType.wild => 'wild-roulette',
  };
  return 'assets/cards/$name.webp';
}

/// Card.vue's alt text.
String cardAlt(Card card) {
  if (card.isWild) return 'Wild ${card.type.name}';
  final value = card.value != null ? ' ${card.value}' : '';
  return '${card.color.name}$value ${card.type.name}'.trim();
}

/// --card-glow / --card-glow-soft per card colour.
({Color glow, Color soft}) cardGlow(CardColor c) => switch (c) {
      CardColor.red => (glow: const Color(0xFFFF2A2A), soft: const Color(0x8CFF2A2A)),
      CardColor.blue => (glow: const Color(0xFF00BFFF), soft: const Color(0x8C00BFFF)),
      CardColor.green => (glow: const Color(0xFF00FF66), soft: const Color(0x8C00FF66)),
      CardColor.yellow => (glow: const Color(0xFFFFCC00), soft: const Color(0x8CFFCC00)),
      CardColor.wild => (glow: const Color(0xFFFF66DD), soft: const Color(0x8CFF66DD)),
    };

bool _isDangerType(CardType t) => const {
      CardType.draw2,
      CardType.draw4,
      CardType.draw6,
      CardType.draw10,
      CardType.wildReverseDraw4,
      CardType.wildColorRoulette,
    }.contains(t);

/// Card.vue: the face art with its neon outline, playable glow pulse, wild
/// holographic shimmer and the red danger pulse on playable +N cards.
class CardFace extends StatefulWidget {
  const CardFace({super.key, required this.card, required this.width, required this.height, this.isPlayable = false});

  final Card card;
  final double width;
  final double height;
  final bool isPlayable;

  @override
  State<CardFace> createState() => _CardFaceState();
}

class _CardFaceState extends State<CardFace> with TickerProviderStateMixin {
  // 2.2s glow pulse, 1.8s danger pulse, 4.5s shimmer - only the ones in use run.
  late final AnimationController _glow = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200));
  late final AnimationController _danger = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800));
  late final AnimationController _shimmer = AnimationController(vsync: this, duration: const Duration(milliseconds: 4500));

  bool get _wild => widget.card.isWild;
  bool get _danger_ => widget.isPlayable && _isDangerType(widget.card.type);

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant CardFace oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    final reduced = motionReduced;
    void run(AnimationController c, bool on, {bool reverse = true}) {
      if (on && !reduced) {
        if (!c.isAnimating) c.repeat(reverse: reverse);
      } else {
        c.stop();
      }
    }

    run(_glow, widget.isPlayable);
    run(_danger, _danger_);
    // The danger pulse replaces the shimmer animation on a playable wild draw.
    run(_shimmer, _wild && !_danger_, reverse: false);
  }

  @override
  void dispose() {
    _glow.dispose();
    _danger.dispose();
    _shimmer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final g = cardGlow(widget.card.color);
    final w = widget.width;
    final h = widget.height;
    return SizedBox(
      width: w,
      height: h,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // ::before - neon outline halo, inset -2px.
          Positioned(
            left: -2,
            top: -2,
            right: -2,
            bottom: -2,
            child: AnimatedBuilder(
              animation: _glow,
              builder: (context, _) {
                if (!widget.isPlayable) {
                  return Opacity(
                    opacity: 0.45,
                    child: _halo(1, g.soft, 12, g.soft),
                  );
                }
                final t = Curves.easeInOut.transform(_glow.value);
                return _halo(1.5 + 0.5 * t, g.glow, 18 + 16 * t, Color.lerp(g.soft, g.glow, t)!);
              },
            ),
          ),
          // The art.
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset(
                cardAsset(widget.card),
                fit: BoxFit.contain,
                gaplessPlayback: true,
                filterQuality: FilterQuality.medium,
                semanticLabel: cardAlt(widget.card),
              ),
            ),
          ),
          // ::after - holographic shimmer on wilds (inset 4px, screen blend).
          if (_wild)
            Positioned(
              left: _danger_ ? -1 : 4,
              top: _danger_ ? -1 : 4,
              right: _danger_ ? -1 : 4,
              bottom: _danger_ ? -1 : 4,
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: _shimmer,
                  builder: (context, _) => CustomPaint(
                    painter: _ShimmerPainter(_danger_ ? 0 : _shimmer.value * 2 * math.pi, _danger_ ? 10 : 6),
                  ),
                ),
              ),
            ),
          // ::after - danger pulse on playable +N / roulette.
          if (_danger_)
            Positioned(
              left: -1,
              top: -1,
              right: -1,
              bottom: -1,
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: _danger,
                  builder: (context, _) {
                    final t = Curves.easeInOut.transform(_danger.value);
                    return OuterGlow(
                      radius: BorderRadius.circular(10),
                      shadows: [
                        BoxShadow(
                          color: const Color(0xFFFF2A2A).withValues(alpha: 0.3 + 0.4 * t),
                          blurRadius: 14 + 14 * t,
                        ),
                      ],
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: const Color(0xFFFF2A2A).withValues(alpha: 0.45 + 0.45 * t),
                            width: 1.5 + t,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _halo(double ring, Color ringColor, double blur, Color glowColor) => OuterGlow(
        radius: BorderRadius.circular(10),
        shadows: [BoxShadow(color: glowColor, blurRadius: blur)],
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: ringColor, width: ring),
          ),
        ),
      );
}

class _ShimmerPainter extends CustomPainter {
  _ShimmerPainter(this.angle, this.radius);

  final double angle;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final shader = SweepGradient(
      colors: const [
        Color(0x00FF00C8),
        Color(0x5900C8FF),
        Color(0x00FFDC00),
        Color(0x59FF64C8),
        Color(0x00FF00C8),
      ],
      transform: GradientRotation(angle - math.pi / 2),
    ).createShader(rect);
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, Radius.circular(radius)),
      Paint()
        ..shader = shader
        ..blendMode = BlendMode.screen
        ..color = const Color(0xA6FFFFFF),
    );
  }

  @override
  bool shouldRepaint(covariant _ShimmerPainter old) => old.angle != angle || old.radius != radius;
}

/// CardBack.vue - the industrial plate back, painted from the SVG's own
/// geometry (viewBox 250x350).
class CardBack extends StatelessWidget {
  const CardBack({super.key, required this.width, required this.height, this.accent, this.stripe, this.shadow = true});

  final double width;
  final double height;
  final Color? accent;
  final Color? stripe;
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        boxShadow: shadow ? const [BoxShadow(color: Color(0x80000000), offset: Offset(0, 10), blurRadius: 20)] : null,
      ),
      foregroundDecoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x1AFFFFFF)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: CustomPaint(
          painter: CardBackPainter(accent: accent ?? const Color(0xFFFF3333), stripe: stripe ?? OmColors.hazard),
        ),
      ),
    );
  }
}

class CardBackPainter extends CustomPainter {
  const CardBackPainter({this.accent = const Color(0xFFFF3333), this.stripe = OmColors.hazard});

  final Color accent;
  final Color stripe;

  @override
  void paint(Canvas canvas, Size size) {
    // preserveAspectRatio xMidYMid meet onto the 250x350 viewBox.
    final scale = math.min(size.width / 250, size.height / 350);
    canvas.save();
    canvas.translate((size.width - 250 * scale) / 2, (size.height - 350 * scale) / 2);
    canvas.scale(scale);

    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(0, 0, 250, 350), const Radius.circular(16)),
      Paint()..color = const Color(0xFF111111),
    );
    final plate = RRect.fromRectAndRadius(const Rect.fromLTWH(6, 6, 238, 338), const Radius.circular(12));
    canvas.drawRRect(
      plate,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2A2A2A), Color(0xFF1A1A1A)],
        ).createShader(plate.outerRect),
    );
    canvas.drawRRect(
      plate,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = const Color(0xFF333333),
    );

    // Hazard stripes: 12-wide bands at y=40 and y=310, a 45deg 10/10 pattern.
    for (final y in const [40.0, 310.0]) {
      final band = Rect.fromLTRB(6, y - 6, 244, y + 6);
      canvas.save();
      canvas.clipRect(band);
      canvas.drawRect(band, Paint()..color = Colors.black);
      final p = Paint()..color = stripe;
      // Pattern rotated 45deg: stripes run diagonally with a 20/sqrt2 period on x.
      const period = 20 * math.sqrt2;
      for (var x = -40.0; x < 290; x += period) {
        final path = Path()
          ..moveTo(x, y - 6)
          ..lineTo(x + period / 2, y - 6)
          ..lineTo(x + period / 2 - 12, y + 6)
          ..lineTo(x - 12, y + 6)
          ..close();
        canvas.drawPath(path, p);
      }
      canvas.restore();
    }

    // Dashed outer ring (r=90, dash 10 gap 5).
    final dashed = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = const Color(0x1AFFFFFF);
    const circumference = 2 * math.pi * 90;
    for (var d = 0.0; d < circumference; d += 15) {
      final a0 = d / 90;
      final a1 = (d + 10) / 90;
      canvas.drawArc(Rect.fromCircle(center: const Offset(125, 175), radius: 90), a0, a1 - a0, false, dashed);
    }

    canvas.drawCircle(const Offset(125, 175), 75, Paint()..color = Colors.black);
    canvas.drawCircle(
      const Offset(125, 175),
      75,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..color = accent,
    );

    void text(String s, double y, double fontSize, Color color) {
      final tp = TextPainter(
        text: TextSpan(text: s, style: TextStyle(fontFamily: fontDisplay, fontSize: fontSize, color: color, height: 1)),
        textDirection: TextDirection.ltr,
      )..layout();
      // dominant-baseline: middle
      tp.paint(canvas, Offset(125 - tp.width / 2, y - tp.height / 2));
    }

    text('OPEN', 165, 42, accent);
    text('MERCY', 205, 32, const Color(0xFFE6E6E6));
    canvas.restore();

    // Scratches overlay: 135deg 1px lines every 10px, 0.03 white at 0.5.
    final scratch = Paint()
      ..color = const Color(0x08FFFFFF)
      ..strokeWidth = 1;
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    for (var d = -size.height; d < size.width + size.height; d += 10 * math.sqrt2) {
      canvas.drawLine(Offset(d, 0), Offset(d + size.height, size.height), scratch);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CardBackPainter old) => old.accent != accent || old.stripe != stripe;
}
