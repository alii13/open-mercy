// BattlePit.vue + CardPile.vue + GameBackground.vue, phone breakpoint.

import 'dart:math' as math;

import 'package:flutter/material.dart' hide Card;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../engine/types.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/card_view.dart';
import '../widgets/outer_glow.dart';
import '../widgets/rolling_number.dart';

/// .discard-color-* ring colours.
Color discardRing(CardColor c) => switch (c) {
      CardColor.red => const Color(0xFFFF2A2A),
      CardColor.blue => const Color(0xFF00BFFF),
      CardColor.green => const Color(0xFF00FF66),
      CardColor.yellow => const Color(0xFFFFCC00),
      CardColor.wild => Colors.transparent,
    };

/// .dot-* colours.
Color dotColor(CardColor c) => switch (c) {
      CardColor.red => const Color(0xFFFF4444),
      CardColor.blue => const Color(0xFF00BFFF),
      CardColor.green => const Color(0xFF00FF66),
      CardColor.yellow => const Color(0xFFFFCC00),
      CardColor.wild => Colors.transparent,
    };

/// GameBackground.vue: metal grid, -45deg table hatching, vignette.
class GameBackground extends StatelessWidget {
  const GameBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const IgnorePointer(
      child: Stack(
        children: [
          Positioned.fill(child: CustomPaint(painter: _TablePainter())),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  radius: 0.5,
                  transform: CssRadial.circle(),
                  colors: [Color(0x00000000), Color(0xCC000000)],
                  stops: [0.4, 1],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TablePainter extends CustomPainter {
  const _TablePainter();

  @override
  void paint(Canvas canvas, Size size) {
    // .metal-surface: 1px black lines every 51px both ways at 0.1 opacity.
    final grid = Paint()..color = const Color(0x1A000000);
    for (var x = 50.0; x < size.width; x += 51) {
      canvas.drawRect(Rect.fromLTWH(x, 0, 1, size.height), grid);
    }
    for (var y = 50.0; y < size.height; y += 51) {
      canvas.drawRect(Rect.fromLTWH(0, y, size.width, 1), grid);
    }
    // .table-hatching: -45deg, 2px of white at 0.018 every 22px.
    final hatch = Paint()
      ..color = const Color(0x05FFFFFF)
      ..strokeWidth = 2;
    final step = 22 * math.sqrt2;
    for (var d = -size.height; d < size.width + size.height; d += step) {
      canvas.drawLine(Offset(d, 0), Offset(d + size.height, size.height), hatch);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// The table with both stations and the mobile HUD.
class BattlePit extends StatefulWidget {
  const BattlePit({
    super.key,
    required this.deckKey,
    required this.discardKey,
    required this.pitTableKey,
    required this.deckCount,
    required this.discardPile,
    required this.currentColor,
    required this.direction,
    required this.drawStack,
    required this.myCardCount,
    required this.showDrawHint,
    required this.onDraw,
    required this.consumeSuppressSlam,
    required this.deckPileKey,
  });

  final GlobalKey deckKey;
  final GlobalKey<DrawPileState> deckPileKey;
  final GlobalKey<DiscardPileState> discardKey;
  final GlobalKey pitTableKey;
  final int deckCount;
  final List<Card> discardPile;
  final CardColor currentColor;
  final int direction;
  final int drawStack;
  final int? myCardCount;
  final bool showDrawHint;
  final VoidCallback onDraw;

  /// Reads + resets the store's suppressDiscardSlam flag.
  final bool Function() consumeSuppressSlam;

  @override
  State<BattlePit> createState() => BattlePitState();
}

class BattlePitState extends State<BattlePit> with TickerProviderStateMixin {
  // Direction cell flip (rotationX -90 -> 0, 0.45s back.out(1.8)).
  late final AnimationController _flip = AnimationController(vsync: this, duration: const Duration(milliseconds: 450));
  late final AnimationController _spin = AnimationController(vsync: this, duration: const Duration(seconds: 3));
  late final AnimationController _stackPulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 800));

  @override
  void initState() {
    super.initState();
    _flip.value = 1;
    if (!motionReduced) _spin.repeat();
    _syncStackPulse();
  }

  @override
  void didUpdateWidget(covariant BattlePit oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.direction != widget.direction && !motionReduced) _flip.forward(from: 0);
    _syncStackPulse();
  }

  void _syncStackPulse() {
    if (widget.drawStack >= 12 && !motionReduced) {
      if (!_stackPulse.isAnimating) _stackPulse.repeat(reverse: true);
    } else {
      _stackPulse.stop();
      _stackPulse.value = 0;
    }
  }

  @override
  void dispose() {
    _flip.dispose();
    _spin.dispose();
    _stackPulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final mercyIntensity = w.myCardCount == null ? 0.0 : math.min(1.0, w.myCardCount! / 25);
    return Stack(
      fit: StackFit.expand,
      children: [
        // Layer 2: felt surface - warm top light + dark vignette.
        const IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0.1, -0.2),
                radius: 0.65,
                colors: [Color(0x0FFFC47A), Color(0x05FFC47A), Color(0x00FFC47A)],
                stops: [0, 0.35, 0.7],
              ),
            ),
          ),
        ),
        const IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment(0.1, 0.2),
                radius: 0.9,
                colors: [Color(0x80000000), Color(0x80000000), Color(0x33000000), Color(0x00000000)],
                stops: [0, 0.5, 0.8, 1],
              ),
            ),
          ),
        ),
        // Layer 3: danger gradient bleeding from the top-right with mercy.
        IgnorePointer(
          child: AnimatedContainer(
            duration: OmMotion.soft,
            curve: OmMotion.easeSoft,
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0.9, -1.2),
                radius: 0.7,
                colors: [
                  Color.fromRGBO(255, 42, 42, mercyIntensity * 0.35),
                  Color.fromRGBO(255, 42, 42, mercyIntensity * 0.12),
                  const Color(0x00FF2A2A),
                ],
                stops: const [0, 0.3, 0.7],
              ),
            ),
          ),
        ),
        // Layer 6 + mobile HUD.
        Padding(
          padding: const EdgeInsets.symmetric(vertical: OmSpace.s3, horizontal: OmSpace.s2),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Row(
                key: w.pitTableKey,
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  _DrawStation(
                    deckKey: w.deckKey,
                    pileKey: w.deckPileKey,
                    count: w.deckCount,
                    showHint: w.showDrawHint,
                    onTap: w.onDraw,
                  ),
                  const SizedBox(width: OmSpace.s6),
                  DiscardPile(
                    key: w.discardKey,
                    cards: w.discardPile,
                    currentColor: w.currentColor,
                    consumeSuppressSlam: w.consumeSuppressSlam,
                  ),
                ],
              ),
              if (w.myCardCount != null) ...[
                const SizedBox(height: OmSpace.s3 + OmSpace.s4),
                _MobileHud(
                  direction: w.direction,
                  currentColor: w.currentColor,
                  drawStack: w.drawStack,
                  myCardCount: w.myCardCount!,
                  flip: _flip,
                  spin: _spin,
                  stackPulse: _stackPulse,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Thin L-marks at each corner of a station (.station::after).
class _CornerBrackets extends CustomPainter {
  const _CornerBrackets(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size s) {
    final p = Paint()..color = color;
    const l = 14.0;
    for (final (x, y, dx, dy) in [
      (0.0, 0.0, 1.0, 1.0),
      (s.width, 0.0, -1.0, 1.0),
      (0.0, s.height, 1.0, -1.0),
      (s.width, s.height, -1.0, -1.0),
    ]) {
      canvas.drawRect(Rect.fromLTWH(dx > 0 ? x : x - l, dy > 0 ? y : y - 1, l, 1), p);
      canvas.drawRect(Rect.fromLTWH(dx > 0 ? x : x - 1, dy > 0 ? y : y - l, 1, l), p);
    }
  }

  @override
  bool shouldRepaint(covariant _CornerBrackets old) => old.color != color;
}

/// The radial "slot pad" shadow under a station (.station::before).
class _SlotPad extends StatelessWidget {
  const _SlotPad({required this.cyan});
  final bool cyan;

  @override
  Widget build(BuildContext context) => Positioned(
        left: -4,
        right: -4,
        top: -4,
        bottom: 0,
        child: IgnorePointer(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: Alignment.bottomCenter,
                radius: 0.8,
                colors: cyan
                    ? const [Color(0x1F00F3FF), Color(0x8C000000), Color(0x00000000)]
                    : const [Color(0x8C000000), Color(0x00000000)],
                stops: cyan ? const [0, 0.4, 0.8] : const [0, 0.7],
              ),
            ),
          ),
        ),
      );
}

const _drawW = 55.0, _drawH = 77.0, _discardW = 75.0, _discardH = 105.0;

class _DrawStation extends StatelessWidget {
  const _DrawStation({
    required this.deckKey,
    required this.pileKey,
    required this.count,
    required this.showHint,
    required this.onTap,
  });

  final GlobalKey deckKey;
  final GlobalKey<DrawPileState> pileKey;
  final int count;
  final bool showHint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          const _SlotPad(cyan: true),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              boxShadow: [BoxShadow(color: Color(0x99000000), offset: Offset(0, 18), blurRadius: 28, spreadRadius: -14)],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DrawPile(key: pileKey, deckKey: deckKey, count: count),
              ],
            ),
          ),
          const Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _CornerBrackets(Color(0x4D00F3FF))))),
          // .action-hint: absolutely below the station (top: 100% + 8px), so
          // showing it never widens the station.
          if (showHint)
            const Positioned(
              left: -60,
              right: -60,
              bottom: -OmSpace.s2,
              child: IgnorePointer(
                child: FractionalTranslation(
                  translation: Offset(0, 1),
                  child: Center(child: _FlickerHint('TAP TO DRAW')),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _FlickerHint extends StatefulWidget {
  const _FlickerHint(this.text);
  final String text;

  @override
  State<_FlickerHint> createState() => _FlickerHintState();
}

class _FlickerHintState extends State<_FlickerHint> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 1));

  @override
  void initState() {
    super.initState();
    if (!motionReduced) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween(begin: 1.0, end: 0.5).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
        child: Text(widget.text, maxLines: 1, style: monoText(11.2, color: OmColors.neonBlue, ls: 0.2)),
      );
}

/// CardPile.vue (draw): up to 7 stacked backs plus the count tag.
class DrawPile extends StatefulWidget {
  const DrawPile({super.key, required this.deckKey, required this.count});

  final GlobalKey deckKey;
  final int count;

  @override
  State<DrawPile> createState() => DrawPileState();
}

class DrawPileState extends State<DrawPile> with SingleTickerProviderStateMixin {
  late final AnimationController _riffle = AnimationController(vsync: this);
  List<({double x, double y, double r, double delay})> _riffleTargets = [];
  final _rand = math.Random();

  int get _depth => math.min(math.max((widget.count / 8).ceil(), 3), 7);

  ({double x, double y, double r, double b}) _rest(int i0) {
    final seed = i0 * 31 + 7;
    return (x: i0 * 2.5, y: i0 * 6.0, r: ((seed % 20) - 10) * 0.5, b: 1 - i0 * 0.05);
  }

  /// useDealerIntro deck riffle: each card pops out (0.12s, staggered 0.025
  /// in random order) and snaps back to its rest pose (0.3s back.out,
  /// staggered 0.015). Resolves when settled.
  Future<void> riffle() async {
    if (motionReduced) return;
    final n = math.min(_depth, 8);
    final order = List.generate(n, (i) => i)..shuffle(_rand);
    _riffleTargets = List.generate(n, (i) {
      final rank = order.indexOf(i);
      return (
        x: -18 + _rand.nextDouble() * 36,
        y: -8 + _rand.nextDouble() * 16,
        r: -12 + _rand.nextDouble() * 24,
        delay: rank * 0.025,
      );
    });
    final outEnd = (n - 1) * 0.025 + 0.12;
    final total = outEnd + 0.05 + (n - 1) * 0.015 + 0.3;
    _riffle.duration = Duration(milliseconds: (total * 1000).round());
    await _riffle.forward(from: 0);
    _riffleTargets = [];
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _riffle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = math.min(_depth, 8);
    return SizedBox(
      width: _drawW,
      height: _drawH,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Base shadow under the pile (.card-pile::before).
          Positioned(
            left: _drawW * 0.2,
            right: _drawW * 0.2,
            bottom: -8,
            height: 18,
            child: const DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(colors: [Color(0xB3000000), Color(0x00000000)], stops: [0, 0.7]),
              ),
            ),
          ),
          SizedBox(key: widget.deckKey, width: _drawW, height: _drawH),
          // Deepest first so the top card (i0 = 0) paints last.
          for (var i0 = n - 1; i0 >= 0; i0--)
            AnimatedBuilder(
              animation: _riffle,
              builder: (context, child) {
                final rest = _rest(i0);
                var x = rest.x, y = rest.y, r = rest.r;
                if (_riffleTargets.length == n && _riffle.isAnimating) {
                  final tgt = _riffleTargets[i0];
                  final total = _riffle.duration!.inMilliseconds / 1000;
                  final t = _riffle.value * total;
                  final outStart = tgt.delay;
                  final outEnd = (n - 1) * 0.025 + 0.12;
                  final backStart = outEnd + 0.05 + i0 * 0.015;
                  if (t < backStart) {
                    final p = Curves.easeInOut.transform(((t - outStart) / 0.12).clamp(0.0, 1.0));
                    x = rest.x + (tgt.x - rest.x) * p;
                    y = rest.y + (tgt.y - rest.y) * p;
                    r = rest.r + (tgt.r - rest.r) * p;
                  } else {
                    final p = const Cubic(0.34, 1.56, 0.64, 1).transform(((t - backStart) / 0.3).clamp(0.0, 1.0));
                    x = tgt.x + (rest.x - tgt.x) * p;
                    y = tgt.y + (rest.y - tgt.y) * p;
                    r = tgt.r + (rest.r - tgt.r) * p;
                  }
                }
                return Transform.translate(
                  offset: Offset(x, y),
                  child: Transform.rotate(angle: r * math.pi / 180, child: child),
                );
              },
              child: ColorFiltered(
                colorFilter: _brightness(_rest(i0).b),
                child: Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(6),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0x99000000),
                        offset: Offset(0, 2 + i0 * 0.7),
                        blurRadius: (2 + i0 * 0.7) * 2,
                      ),
                    ],
                  ),
                  child: const CardBack(width: _drawW, height: _drawH, shadow: false),
                ),
              ),
            ),
          // Count tag, 25px below the pile.
          Positioned(
            left: -20,
            right: -20,
            bottom: -25,
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: const Color(0xFF111111),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: const Color(0xFF333333)),
                ),
                child: Text('${widget.count}', style: monoText(12.8, color: OmColors.textMuted)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

ColorFilter _brightness(double b) => ColorFilter.matrix(<double>[
      b, 0, 0, 0, 0,
      0, b, 0, 0, 0,
      0, 0, b, 0, 0,
      0, 0, 0, 1, 0,
    ]);

/// grayscale(0.25) brightness(0.78)
const _scatterFilter = ColorFilter.matrix(<double>[
  0.6366, 0.1394, 0.0140, 0, 0,
  0.0414, 0.7350, 0.0140, 0, 0,
  0.0414, 0.1394, 0.6097, 0, 0,
  0, 0, 0, 1, 0,
]);

/// The discard station: colour ring + CardPile (discard) with the slam-in and
/// ring flash on every new card.
class DiscardPile extends StatefulWidget {
  const DiscardPile({super.key, required this.cards, required this.currentColor, required this.consumeSuppressSlam});

  final List<Card> cards;
  final CardColor currentColor;
  final bool Function() consumeSuppressSlam;

  @override
  State<DiscardPile> createState() => DiscardPileState();
}

class DiscardPileState extends State<DiscardPile> with TickerProviderStateMixin {
  late final AnimationController _slam = AnimationController(vsync: this, duration: const Duration(milliseconds: 420));
  late final AnimationController _reveal = AnimationController(vsync: this, duration: const Duration(milliseconds: 480));
  late final AnimationController _flash = AnimationController(vsync: this, duration: const Duration(milliseconds: 600));
  double _slamRot = 0;
  bool _suppressed = false;
  final _rand = math.Random();

  @override
  void initState() {
    super.initState();
    _slam.value = 1;
    _reveal.value = 1;
  }

  @override
  void didUpdateWidget(covariant DiscardPile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.cards.length > oldWidget.cards.length) {
      if (widget.consumeSuppressSlam()) {
        // A flying clone is delivering this card: hold the real top card
        // invisible until it lands (~0.36s), then fade it in and flash.
        _suppressed = true;
        _reveal.forward(from: 0).whenComplete(() => _suppressed = false);
        Future<void>.delayed(const Duration(milliseconds: 360), _flashRing);
      } else {
        _suppressed = false;
        _slamRot = -30 + _rand.nextDouble() * 60;
        if (!motionReduced) _slam.forward(from: 0);
        _flashRing();
      }
    }
  }

  void _flashRing() {
    if (!mounted || motionReduced) return;
    _flash.forward(from: 0);
  }

  @override
  void dispose() {
    _slam.dispose();
    _reveal.dispose();
    _flash.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cards = widget.cards;
    final top = cards.isEmpty ? null : cards.last;
    final scatter = math.min(math.max(cards.length - 1, 0), 5);
    final ring = discardRing(widget.currentColor);
    final hasRing = widget.currentColor != CardColor.wild;

    return AnimatedBuilder(
      animation: _flash,
      builder: (context, child) {
        // discard-flash-burst: peak at 18%, cubic-bezier(0.22,1,0.36,1).
        final v = _flash.isAnimating ? _flash.value : 0.0;
        final peak = v <= 0.18 ? v / 0.18 : 1 - const Cubic(0.22, 1, 0.36, 1).transform((v - 0.18) / 0.82);
        final k = _flash.isAnimating ? peak : 0.0;
        return Transform.scale(
          scale: 1 + 0.05 * k,
          child: OuterGlow(
            radius: BorderRadius.circular(OmRadius.lg),
            shadows: hasRing
                ? [
                    BoxShadow(color: ring.withValues(alpha: 0.4 + 0.6 * k), blurRadius: 36 + 44 * k),
                    if (k > 0) BoxShadow(color: ring.withValues(alpha: 0.55 * k), blurRadius: 140 * k),
                  ]
                : const [],
            child: AnimatedContainer(
              duration: OmMotion.soft,
              curve: OmMotion.easeSoft,
              padding: const EdgeInsets.all(OmSpace.s3),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(OmRadius.lg),
                gradient: hasRing
                    ? RadialGradient(colors: [ring.withValues(alpha: 0.14), ring.withValues(alpha: 0)], stops: const [0, 0.7])
                    : null,
                // inset 0 0 0 1px ring (2px at the flash peak)
                border: hasRing ? Border.all(color: ring.withValues(alpha: 0.3 + 0.5 * k), width: 1 + k) : null,
              ),
              child: child,
            ),
          ),
        );
      },
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          const _SlotPad(cyan: false),
          SizedBox(
            width: _discardW,
            height: _discardH,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                for (var i = 1; i <= scatter; i++) _scatterBack(i),
                if (top != null)
                  AnimatedBuilder(
                    animation: Listenable.merge([_slam, _reveal]),
                    builder: (context, child) {
                      if (_suppressed) {
                        final t = _reveal.value * 0.48;
                        final o = t < 0.36 ? 0.0 : ((t - 0.36) / 0.12).clamp(0.0, 1.0);
                        return Opacity(opacity: o, child: child);
                      }
                      if (!_slam.isAnimating) return child!;
                      final p = const Cubic(0.34, 1.56, 0.64, 1).transform(_slam.value);
                      return Transform.translate(
                        offset: Offset(0, -100 * (1 - p)),
                        child: Transform.rotate(
                          angle: _slamRot * (1 - p) * math.pi / 180,
                          child: Transform.scale(
                            scale: 1.5 - 0.5 * p,
                            child: Opacity(opacity: _slam.value.clamp(0.0, 1.0), child: child),
                          ),
                        ),
                      );
                    },
                    child: DecoratedBox(
                      decoration: const BoxDecoration(
                        boxShadow: [BoxShadow(color: Color(0x99000000), offset: Offset(0, 10), blurRadius: 20, spreadRadius: -10)],
                      ),
                      child: CardFace(key: ValueKey(top.id), card: top, width: _discardW, height: _discardH),
                    ),
                  ),
              ],
            ),
          ),
          const Positioned.fill(child: IgnorePointer(child: CustomPaint(painter: _CornerBrackets(Color(0x38FFCC00))))),
        ],
      ),
    );
  }

  Widget _scatterBack(int i) {
    final seed = i * 31 + 7;
    final rot = ((seed % 50) - 25).toDouble();
    final ox = ((seed * 11) % 44) - 22.0;
    final oy = ((seed * 17) % 30) - 15.0;
    return Transform.translate(
      offset: Offset(ox, oy),
      child: Transform.rotate(
        angle: rot * math.pi / 180,
        child: Opacity(
          opacity: 0.78,
          child: ColorFiltered(
            colorFilter: _scatterFilter,
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(6),
                boxShadow: [BoxShadow(color: const Color(0x80000000), offset: Offset(0, 4 + i * 0.5), blurRadius: 10.0 + i)],
              ),
              child: const CardBack(width: _discardW, height: _discardH, shadow: false),
            ),
          ),
        ),
      ),
    );
  }
}

/// .pit-hud-mobile: direction / colour / stack / mercy meter pill.
class _MobileHud extends StatelessWidget {
  const _MobileHud({
    required this.direction,
    required this.currentColor,
    required this.drawStack,
    required this.myCardCount,
    required this.flip,
    required this.spin,
    required this.stackPulse,
  });

  final int direction;
  final CardColor currentColor;
  final int drawStack;
  final int myCardCount;
  final AnimationController flip;
  final AnimationController spin;
  final AnimationController stackPulse;

  @override
  Widget build(BuildContext context) {
    final n = myCardCount;
    final critical = n >= 20;
    final warning = n >= 15 && !critical;
    final pct = math.min(100, n / 25 * 100);
    final fill = critical
        ? const [Color(0xFFFF8800), OmColors.alert]
        : warning
            ? const [OmColors.hazard, Color(0xFFFF8800)]
            : const [OmColors.neonGreen, OmColors.hazard];
    final textColor = critical ? OmColors.alert : (warning ? OmColors.hazard : OmColors.textPrimary);

    final cells = <Widget>[
      // Direction - icon spins (CCW when reversed) and the cell flips on change.
      AnimatedBuilder(
        animation: Listenable.merge([flip, spin]),
        builder: (context, child) {
          final p = const Cubic(0.34, 1.8, 0.64, 1).transform(flip.value);
          return Transform(
            alignment: Alignment.center,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 1 / 500)
              ..rotateX((-90 + 90 * p) * math.pi / 180),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Transform.rotate(
                  angle: spin.value * 2 * math.pi * (direction == 1 ? 1 : -1),
                  child: const Icon(LucideIcons.rotateCw, size: OmIcon.inline, color: OmColors.textSecondary),
                ),
                const SizedBox(width: OmSpace.s2),
                Text(direction == 1 ? 'CW' : 'CCW', style: monoText(OmText.xs, color: OmColors.textSecondary, ls: 0.15)),
              ],
            ),
          );
        },
      ),
      if (currentColor != CardColor.wild)
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: dotColor(currentColor),
            boxShadow: [BoxShadow(color: dotColor(currentColor), blurRadius: 8)],
          ),
        ),
      if (drawStack > 0)
        AnimatedBuilder(
          animation: stackPulse,
          builder: (context, child) => Opacity(opacity: 1 - 0.4 * stackPulse.value, child: child),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('+', style: displayText(OmText.base, color: drawStack >= 12 ? OmColors.alert : OmColors.hazard)),
              RollingNumber(
                value: drawStack,
                style: displayText(OmText.base, color: drawStack >= 12 ? OmColors.alert : OmColors.hazard),
              ),
            ],
          ),
        ),
      // flex: 1 with min-width 110px (border-box) inside an inline-flex pill:
      // the cell settles at exactly 110px, so the bar gets what's left.
      SizedBox(
        width: 110 - 2 * OmSpace.s3,
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: 4,
                decoration: BoxDecoration(color: const Color(0x14FFFFFF), borderRadius: BorderRadius.circular(2)),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: AnimatedFractionallySizedBox(
                    duration: OmMotion.soft,
                    curve: OmMotion.easeSoft,
                    widthFactor: pct / 100,
                    heightFactor: 1,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(2),
                        gradient: LinearGradient(colors: fill),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: OmSpace.s2),
            RollingNumber(value: n, style: displayText(OmText.sm, color: textColor)),
            Text('/25', style: displayText(OmText.sm, color: textColor)),
          ],
        ),
      ),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: OmSpace.s3, vertical: OmSpace.s2),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x8C000000), Color(0x40000000)],
        ),
        border: Border.all(color: const Color(0x0FFFFFFF)),
        borderRadius: BorderRadius.circular(OmRadius.pill),
      ),
      child: IntrinsicHeight(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (i, cell) in cells.indexed)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: OmSpace.s3, vertical: OmSpace.s1),
                margin: EdgeInsets.only(left: i == 0 ? 0 : OmSpace.s2),
                decoration: i == cells.length - 1
                    ? null
                    : const BoxDecoration(border: Border(right: BorderSide(color: Color(0x0FFFFFFF)))),
                child: cell,
              ),
          ],
        ),
      ),
    );
  }
}
