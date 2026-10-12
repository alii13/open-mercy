// The game-feel layer: everything the web draws with GSAP clones
// (useGameFeel, useCardAnimations, FxLayer's DOM flashes) and with the
// three.js canvas (useFxCanvas). Phones run the web's 'medium' FX tier:
// half particle counts, 800 max, no ambient heat embers.
//
// All positions are global (screen) rects; the overlay fills the screen.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart' hide Card;
import 'package:flutter/scheduler.dart';

import '../../engine/types.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/card_view.dart';

/// FxColor palette (useFxCanvas PALETTE / useGameFeel GLOW).
Color fxColor(CardColor c) => switch (c) {
      CardColor.red => const Color(0xFFFF2A2A),
      CardColor.blue => const Color(0xFF00BFFF),
      CardColor.green => const Color(0xFF00FF66),
      CardColor.yellow => const Color(0xFFFFCC00),
      CardColor.wild => const Color(0xFFFF66DD),
    };

/// FxLayer EDGE_GLOW
Color edgeGlow(CardColor c) => switch (c) {
      CardColor.red => const Color(0x8CFF2A2A),
      CardColor.blue => const Color(0x8000BFFF),
      CardColor.green => const Color(0x8000FF66),
      CardColor.yellow => const Color(0x80FFCC00),
      CardColor.wild => const Color(0x8CFF66DD),
    };

const _particleScale = 0.5;
const _maxParticles = 800;
const _ringPool = 6;

final _rand = math.Random();
double _r(double a, double b) => a + _rand.nextDouble() * (b - a);

Rect? globalRect(GlobalKey key) {
  final ctx = key.currentContext;
  final box = ctx?.findRenderObject() as RenderBox?;
  if (box == null || !box.hasSize || !box.attached) return null;
  return box.localToGlobal(Offset.zero) & box.size;
}

class _Particle {
  double x = 0, y = 0, vx = 0, vy = 0, life = 0, maxLife = 1, grav = 0, size0 = 0;
  Color color = Colors.white;
}

class _Ring {
  bool active = false;
  Offset c = Offset.zero;
  double radius = 0, progress = 0, speed = 1;
  Color color = Colors.white;
}

class _Transient {
  _Transient(this.controller, this.builder);
  final AnimationController controller;
  final Widget Function(BuildContext, double) builder;
  bool disposed = false;

  /// Once only: the overlay's own dispose and the animation's
  /// complete-or-cancel callback can both reach this.
  void dispose() {
    if (disposed) return;
    disposed = true;
    controller.dispose();
  }
}

class FxOverlay extends StatefulWidget {
  const FxOverlay({super.key});

  @override
  State<FxOverlay> createState() => FxOverlayState();
}

class FxOverlayState extends State<FxOverlay> with TickerProviderStateMixin {
  final List<_Particle> _particles = List.generate(_maxParticles, (_) => _Particle());
  final List<_Ring> _rings = List.generate(_ringPool, (_) => _Ring());
  int _cursor = 0;
  late final Ticker _ticker = createTicker(_tick);
  Duration _last = Duration.zero;
  final _repaint = ValueNotifier<int>(0);

  final List<_Transient> _items = [];

  bool get _reduced => motionReduced;

  @override
  void dispose() {
    _ticker.dispose();
    for (final i in List.of(_items)) {
      i.dispose();
    }
    _items.clear();
    super.dispose();
  }

  /// Converts a global offset into this overlay's coordinates.
  Offset _local(Offset g) {
    final box = context.findRenderObject() as RenderBox?;
    return box == null ? g : box.globalToLocal(g);
  }

  Rect _localRect(Rect r) => _local(r.topLeft) & r.size;

  // ---- particle canvas (useFxCanvas) --------------------------------------

  void _spawn(double x, double y, double vx, double vy, double size, double ttl, double grav, Color c) {
    final p = _particles[_cursor];
    _cursor = (_cursor + 1) % _maxParticles;
    p
      ..x = x
      ..y = y
      ..vx = vx
      ..vy = vy
      ..life = ttl
      ..maxLife = ttl
      ..grav = grav
      ..size0 = size
      ..color = c;
  }

  void _requestFrame() {
    if (!_ticker.isActive) {
      _last = Duration.zero;
      _ticker.start();
    }
  }

  void _tick(Duration ts) {
    final dt = _last == Duration.zero ? 0.016 : math.min((ts - _last).inMicroseconds / 1e6, 0.05);
    _last = ts;
    var any = false;
    for (final p in _particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.life = 0;
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      any = true;
    }
    for (final r in _rings) {
      if (!r.active) continue;
      r.progress += r.speed * dt;
      if (r.progress >= 1) {
        r.active = false;
        continue;
      }
      any = true;
    }
    _repaint.value++;
    if (!any) _ticker.stop();
  }

  /// Omnidirectional shard/spark burst.
  void burst(Offset globalCenter, CardColor color, [int count = 14]) {
    if (_reduced) return;
    final c = _local(globalCenter);
    final rgb = fxColor(color);
    final n = (count * _particleScale).round();
    for (var i = 0; i < n; i++) {
      final ang = _r(0, math.pi * 2);
      final speed = _r(120, 380);
      _spawn(c.dx, c.dy, math.cos(ang) * speed, math.sin(ang) * speed - _r(20, 90), _r(6, 14), _r(0.45, 0.75), 900, rgb);
    }
    _requestFrame();
  }

  /// Expanding ring - power-card slam, colour flood.
  void shockwave(Offset globalCenter, CardColor color, [double radius = 260, double duration = 0.6]) {
    if (_reduced) return;
    final ring = _rings.where((r) => !r.active).firstOrNull;
    if (ring == null) return;
    ring
      ..active = true
      ..c = _local(globalCenter)
      ..radius = radius
      ..progress = 0
      ..speed = 1 / duration
      ..color = fxColor(color);
    _requestFrame();
  }

  /// Directional spray from A to B - a draw stack eaten.
  void spray(Offset a, Offset b, CardColor color, [int count = 24]) {
    if (_reduced) return;
    final p0 = _local(a);
    final p1 = _local(b);
    final rgb = fxColor(color);
    final n = (count * _particleScale).round();
    final d = p1 - p0;
    final len = d.distance == 0 ? 1.0 : d.distance;
    final nx = d.dx / len, ny = d.dy / len;
    for (var i = 0; i < n; i++) {
      final speed = _r(260, 520);
      final spread = _r(-0.5, 0.5);
      final vx = (nx * math.cos(spread) - ny * math.sin(spread)) * speed;
      final vy = (nx * math.sin(spread) + ny * math.cos(spread)) * speed;
      _spawn(p0.dx, p0.dy, vx, vy, _r(5, 11), _r(0.35, 0.6), 300, rgb);
    }
    _requestFrame();
  }

  /// Multi-colour upward fan - victory.
  void confetti(Offset globalCenter, [int count = 90]) {
    if (_reduced) return;
    final c = _local(globalCenter);
    const cols = CardColor.values;
    final n = (count * _particleScale).round();
    for (var i = 0; i < n; i++) {
      final ang = -math.pi / 2 + _r(-0.95, 0.95);
      final speed = _r(300, 660);
      _spawn(c.dx, c.dy, math.cos(ang) * speed, math.sin(ang) * speed, _r(6, 12), _r(1.1, 1.9), 720,
          fxColor(cols[i % cols.length]));
    }
    _requestFrame();
  }

  // ---- transient widgets (GSAP clones / overlays) --------------------------

  Future<void> _transient(Duration duration, Widget Function(BuildContext, double t) builder) {
    final c = AnimationController(vsync: this, duration: duration);
    final item = _Transient(c, builder);
    setState(() => _items.add(item));
    final done = Completer<void>();
    c.addListener(() {
      if (mounted) setState(() {});
    });
    c.forward().whenCompleteOrCancel(() {
      if (mounted) setState(() => _items.remove(item));
      item.dispose();
      if (!done.isCompleted) done.complete();
    });
    return done.future;
  }

  /// Interval of [t] mapped through [curve] - one timeline segment.
  static double seg(double t, double start, double end, [Curve curve = Curves.linear]) {
    if (t <= start) return 0;
    if (t >= end) return 1;
    return curve.transform((t - start) / (end - start));
  }

  /// useCardAnimations.animateFlyingCard: a 60x84 card back from deck to target
  /// centre, power2.out, random +/-10deg.
  Future<void> flyCardBack(Rect from, Rect to, {double duration = 0.3, double delay = 0}) {
    if (_reduced) return Future.value();
    final f = _localRect(from);
    final t = _localRect(to);
    final target = Offset(t.center.dx - 30, t.center.dy - 42);
    final rot = _r(-10, 10) * math.pi / 180;
    final totalMs = ((delay + duration) * 1000).round();
    final delayFrac = delay / (delay + duration);
    return _transient(Duration(milliseconds: totalMs), (context, v) {
      final p = seg(v, delayFrac, 1, const Cubic(0.215, 0.61, 0.355, 1)); // power2.out
      final pos = Offset.lerp(f.topLeft, target, p)!;
      return Positioned(
        left: pos.dx,
        top: pos.dy,
        child: Transform.rotate(
          angle: rot * p,
          child: Container(
            width: 60,
            height: 84,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(6),
              boxShadow: const [BoxShadow(color: Color(0x80000000), offset: Offset(0, 10), blurRadius: 20)],
            ),
            foregroundDecoration: BoxDecoration(
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: const Color(0x1AFFFFFF)),
            ),
            child: ClipRRect(borderRadius: BorderRadius.circular(6), child: const CustomPaint(painter: CardBackPainter())),
          ),
        ),
      );
    });
  }

  /// animateDrawCardsStaggered - non-blocking.
  void drawStaggered(Rect from, Rect to, int count, {double duration = 0.4, double stagger = 0.15}) {
    for (var i = 0; i < count; i++) {
      flyCardBack(from, to, duration: duration, delay: i * stagger);
    }
  }

  /// Quadratic curve through [mid] at t=0.5 (GSAP motionPath, curviness 1.5).
  static Offset _arc(Offset a, Offset mid, Offset b, double t) {
    final ctrl = mid * 2 - (a + b) / 2;
    final u = 1 - t;
    return a * (u * u) + ctrl * (2 * u * t) + b * (t * t);
  }

  /// HandFan.executePlay: the played card flies from its hand slot to the pile -
  /// anticipation 0.07s, arc 0.32s, impact, then a 0.14s settle.
  Future<void> throwFromHand(Card card, Rect cardRect, Rect discardRect, {VoidCallback? onImpact}) {
    if (_reduced) {
      onImpact?.call();
      return Future.value();
    }
    final a = _localRect(cardRect);
    final d = _localRect(discardRect);
    final target = Offset(d.center.dx - a.width / 2, d.center.dy - a.height / 2);
    final dx = target.dx - a.left, dy = target.dy - a.top;
    final arc = math.max(80.0, math.sqrt(dx * dx + dy * dy) * 0.22);
    final landRot = _r(-20, 20) * math.pi / 180;
    var impacted = false;
    // 0.07 + 0.32 + 0.045 + 0.14 = 0.575s
    const total = 0.575;
    return _transient(const Duration(milliseconds: 575), (context, v) {
      final t = v * total;
      Offset off;
      double scale, rot;
      if (t < 0.07) {
        final p = Curves.easeIn.transform(t / 0.07);
        off = Offset(-dx * 0.04 * p, -dy * 0.04 * p);
        scale = 1 - 0.04 * p;
        rot = 0;
      } else if (t < 0.39) {
        final p = const Cubic(0.215, 0.61, 0.355, 1).transform((t - 0.07) / 0.32);
        final start = Offset(-dx * 0.04, -dy * 0.04);
        off = _arc(start, Offset(dx / 2, dy / 2 - arc), Offset(dx, dy), p);
        scale = 0.96 + (0.92 - 0.96) * p;
        rot = landRot * p;
      } else {
        if (!impacted) {
          impacted = true;
          onImpact?.call();
        }
        final p = t < 0.435 ? 0.0 : const Cubic(0.34, 1.56, 0.64, 1).transform(((t - 0.435) / 0.14).clamp(0.0, 1.0));
        off = Offset(dx, dy);
        scale = 0.92 + (0.82 - 0.92) * p;
        rot = landRot;
      }
      return Positioned(
        left: a.left + off.dx,
        top: a.top + off.dy,
        child: Transform.rotate(
          angle: rot,
          child: Transform.scale(
            scale: scale,
            child: CardFace(card: card, width: a.width, height: a.height),
          ),
        ),
      );
    });
  }

  /// useGameFeel.animateOpponentThrow: a face-up card from a seat to the pile.
  Future<void> opponentThrow(Card card, Rect fromRect, Rect toRect, {VoidCallback? onImpact}) {
    if (_reduced) {
      onImpact?.call();
      return Future.value();
    }
    final from = _local(fromRect.center);
    final to = _local(toRect.center);
    final w = math.min(110.0, toRect.width * 0.62);
    final h = w * 1.4;
    final dx = to.dx - from.dx, dy = to.dy - from.dy;
    final arc = math.max(60.0, math.sqrt(dx * dx + dy * dy) * 0.2);
    final rot0 = _r(-25, 25) * math.pi / 180;
    final rot1 = _r(-18, 18) * math.pi / 180;
    var impacted = false;
    // 0.08 + 0.36 + 0.045 + 0.13 = 0.615s
    return _transient(const Duration(milliseconds: 615), (context, v) {
      final t = v * 0.615;
      Offset off;
      double scale, rot;
      if (t < 0.08) {
        final p = Curves.easeIn.transform(t / 0.08);
        off = Offset(0, -8 * p);
        scale = 0.42 + 0.06 * p;
        rot = rot0;
      } else if (t < 0.44) {
        final p = const Cubic(0.215, 0.61, 0.355, 1).transform((t - 0.08) / 0.36);
        off = _arc(const Offset(0, -8), Offset(dx / 2, dy / 2 - arc), Offset(dx, dy), p);
        scale = 0.48 + (0.95 - 0.48) * p;
        rot = rot0 + (rot1 - rot0) * p;
      } else {
        if (!impacted) {
          impacted = true;
          onImpact?.call();
        }
        final p = t < 0.485 ? 0.0 : const Cubic(0.34, 1.56, 0.64, 1).transform(((t - 0.485) / 0.13).clamp(0.0, 1.0));
        off = Offset(dx, dy);
        scale = 0.95 + (0.86 - 0.95) * p;
        rot = rot1;
      }
      return Positioned(
        left: from.dx - w / 2 + off.dx,
        top: from.dy - h / 2 + off.dy,
        child: Transform.rotate(
          angle: rot,
          child: Transform.scale(
            scale: scale,
            child: Container(
              decoration: const BoxDecoration(
                boxShadow: [BoxShadow(color: Color(0x8C000000), offset: Offset(0, 10), blurRadius: 18)],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.asset(cardAsset(card), width: w, height: h, fit: BoxFit.contain),
              ),
            ),
          ),
        ),
      );
    });
  }

  /// HandFan.triggerPileFlash - a radial colour pop over the discard.
  void pileFlash(Rect discardRect, CardColor color) {
    if (_reduced) return;
    final r = _localRect(discardRect).inflate(40);
    final c = switch (color) {
      CardColor.red => const Color(0xD9FF3C3C),
      CardColor.blue => const Color(0xD93C78FF),
      CardColor.green => const Color(0xD93CDC78),
      CardColor.yellow => const Color(0xD9FFDC3C),
      CardColor.wild => const Color(0xE6FF50DC),
    };
    _transient(const Duration(milliseconds: 500), (context, v) {
      final t = v * 0.5;
      double opacity, scale;
      if (t < 0.18) {
        final p = const Cubic(0.215, 0.61, 0.355, 1).transform(t / 0.18);
        opacity = p;
        scale = 0.4 + 1.2 * p;
      } else {
        final p = const Cubic(0.55, 0.085, 0.68, 0.53).transform((t - 0.18) / 0.32);
        opacity = 1 - p;
        scale = 1.6 + 0.3 * p;
      }
      return Positioned.fromRect(
        rect: r,
        child: IgnorePointer(
          child: Opacity(
            opacity: opacity.clamp(0.0, 1.0),
            child: Transform.scale(
              scale: scale,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [c, c.withValues(alpha: 0)], stops: const [0, 0.7]),
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  /// FxLayer.edgeFlash - inset glow in the card colour on a power slam.
  void edgeFlash(CardColor color) {
    if (_reduced) return;
    final g = edgeGlow(color);
    _transient(const Duration(milliseconds: 400), (context, v) {
      final t = v * 0.4;
      final o = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.32;
      return Positioned.fill(
        child: IgnorePointer(
          child: Opacity(
            opacity: o.clamp(0.0, 1.0),
            child: CustomPaint(painter: _InsetGlowPainter(g)),
          ),
        ),
      );
    });
  }

  /// FxLayer.colorWash - radial wash when a wild's colour resolves.
  void colorWash(CardColor color) {
    if (_reduced) return;
    final g = edgeGlow(color);
    _transient(const Duration(milliseconds: 640), (context, v) {
      final t = v * 0.64;
      final o = t < 0.14 ? t / 0.14 : 1 - (t - 0.14) / 0.5;
      return Positioned.fill(
        child: IgnorePointer(
          child: Opacity(
            opacity: o.clamp(0.0, 1.0),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  radius: 0.5,
                  transform: const CssRadial.ellipse(),
                  colors: [g, g.withValues(alpha: 0)],
                  stops: const [0, 0.65],
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  /// FxLayer.koFlash - white freeze-flash; the caller desaturates the board.
  void koFlash() {
    if (_reduced) return;
    _transient(const Duration(milliseconds: 450), (context, v) {
      final t = v * 0.45;
      final o = t < 0.05 ? 0.8 * t / 0.05 : 0.8 * (1 - (t - 0.05) / 0.4);
      return Positioned.fill(
        child: IgnorePointer(child: ColoredBox(color: Colors.white.withValues(alpha: o.clamp(0.0, 1.0)))),
      );
    });
  }

  /// useGameFeel.showTurnBanner - "YOUR TURN" snaps in, holds 0.8s, snaps out.
  void turnBanner([String text = 'YOUR TURN']) {
    final size = MediaQuery.sizeOf(context);
    final fs = (size.width * 0.05).clamp(24.0, 41.6);
    Widget banner(double opacity, double scale, double dy) => Positioned(
          left: 0,
          right: 0,
          top: size.height * 0.4 - fs,
          child: IgnorePointer(
            child: Center(
              child: Transform.translate(
                offset: Offset(0, dy),
                child: Transform.scale(
                  scale: scale,
                  child: Opacity(
                    opacity: opacity.clamp(0.0, 1.0),
                    child: Container(
                      padding: EdgeInsets.symmetric(horizontal: fs * 0.9, vertical: fs * 0.35),
                      decoration: const BoxDecoration(
                        border: Border.symmetric(horizontal: BorderSide(color: Color(0x6600FF66), width: 2)),
                      ),
                      child: Text(
                        text,
                        style: displayText(fs, color: OmColors.neonGreen, ls: 0.22).copyWith(
                          shadows: const [Shadow(color: Color(0x9900FF66), blurRadius: 24)],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
    if (_reduced) {
      _transient(const Duration(milliseconds: 900), (context, v) => banner(1, 1, 0));
      return;
    }
    // 0.22 in, hold 0.8, 0.18 out = 1.2s
    _transient(const Duration(milliseconds: 1200), (context, v) {
      final t = v * 1.2;
      if (t < 0.22) {
        final p = const Cubic(0.19, 1, 0.22, 1).transform(t / 0.22); // expo.out
        return banner(p, 1.4 - 0.4 * p, 0);
      }
      if (t < 1.02) return banner(1, 1, 0);
      final p = Curves.easeIn.transform((t - 1.02) / 0.18);
      return banner(1 - p, 1 - 0.08 * p, -12 * p);
    });
  }

  /// useDealerIntro title: "DEAL" swoops in (0.25s back.out), holds while
  /// the deck riffles, then scales out (0.3s). Resolves when gone.
  Future<void> dealTitle({required Duration hold}) {
    if (_reduced) return Future.value();
    final size = MediaQuery.sizeOf(context);
    final fs = (size.width * 0.12).clamp(64.0, 144.0);
    final holdS = hold.inMilliseconds / 1000;
    final total = 0.25 + holdS + 0.3;
    return _transient(Duration(milliseconds: (total * 1000).round()), (context, v) {
      final t = v * total;
      double o, s;
      if (t < 0.25) {
        final p = const Cubic(0.34, 1.56, 0.64, 1).transform(t / 0.25);
        o = (t / 0.25).clamp(0.0, 1.0);
        s = 0.8 + 0.2 * p;
      } else if (t < 0.25 + holdS) {
        o = 1;
        s = 1;
      } else {
        final p = Curves.easeIn.transform((t - 0.25 - holdS) / 0.3);
        o = 1 - p;
        s = 1 + 0.4 * p;
      }
      return Positioned(
        left: 0,
        right: 0,
        top: size.height * 0.4 - fs * 0.6,
        child: IgnorePointer(
          child: Center(
            child: Opacity(
              opacity: o.clamp(0.0, 1.0),
              child: Transform.scale(
                scale: s,
                child: Text(
                  'DEAL',
                  style: displayText(fs, color: OmColors.hazard, ls: 0.5).copyWith(
                    shadows: const [
                      Shadow(color: Color(0x8CFFCC00), blurRadius: 30),
                      Shadow(color: Color(0xE6FFCC00), blurRadius: 4),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    });
  }

  /// useGameFeel.skipEveryoneShockwave - two red rings from the pile and a
  /// SKIPPED stamp on each victim seat in turn order.
  void skipEveryoneShockwave(Rect pile, List<Rect> victims, {void Function(int index)? shakeSeat}) {
    if (_reduced) return;
    final c = _local(pile.center);
    for (var ring = 0; ring < 2; ring++) {
      final delay = ring * 0.09;
      final maxScale = 6.0 + ring * 2;
      _transient(Duration(milliseconds: ((0.6 + delay) * 1000).round()), (context, v) {
        final t = v * (0.6 + delay);
        if (t < delay) return const SizedBox.shrink();
        final p = const Cubic(0.19, 1, 0.22, 1).transform((t - delay) / 0.6);
        final s = 0.5 + (maxScale - 0.5) * p;
        return Positioned(
          left: c.dx - 30,
          top: c.dy - 30,
          child: IgnorePointer(
            child: Opacity(
              opacity: (1 - p).clamp(0.0, 1.0),
              child: Transform.scale(
                scale: s,
                child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xE6FF2A2A), width: 3),
                    boxShadow: const [BoxShadow(color: Color(0x8CFF2A2A), blurRadius: 30)],
                  ),
                ),
              ),
            ),
          ),
        );
      });
    }
    for (final (i, seat) in victims.indexed) {
      final delay = 0.12 + i * 0.12;
      final sc = _local(seat.center);
      Future<void>.delayed(Duration(milliseconds: (delay * 1000).round()), () => shakeSeat?.call(i));
      // stamp: 0.18s in (after delay), hold 0.8, 0.3 out
      final total = delay + 0.18 + 0.8 + 0.3;
      _transient(Duration(milliseconds: (total * 1000).round()), (context, v) {
        final t = v * total;
        if (t < delay) return const SizedBox.shrink();
        double o, s, dy;
        if (t < delay + 0.18) {
          final p = (t - delay) / 0.18;
          o = p;
          s = 2.2 - 1.2 * const Cubic(0.34, 1.56, 0.64, 1).transform(p);
          dy = 0;
        } else if (t < delay + 0.98) {
          o = 1;
          s = 1;
          dy = 0;
        } else {
          final p = Curves.easeIn.transform((t - delay - 0.98) / 0.3);
          o = 1 - p;
          s = 1;
          dy = -8 * p;
        }
        return Positioned(
          left: sc.dx - 60,
          top: sc.dy - 20,
          width: 120,
          height: 40,
          child: IgnorePointer(
            child: Center(
              child: Transform.translate(
                offset: Offset(0, dy),
                child: Transform.rotate(
                  angle: -8 * math.pi / 180,
                  child: Transform.scale(
                    scale: s,
                    child: Opacity(
                      opacity: o.clamp(0.0, 1.0),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xC7000000),
                          border: Border.all(color: OmColors.alert, width: 2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text('SKIPPED', style: displayText(10.4, color: OmColors.alert, ls: 0.18)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      });
    }
  }

  /// useGameFeel.sweepDirectionRing - a comet-tail ring once around the table.
  void sweepDirectionRing(Rect pitTable, int sign) {
    if (_reduced) return;
    final r = _localRect(pitTable);
    final w = r.width * 1.04;
    final h = r.height * 1.45;
    _transient(const Duration(milliseconds: 820), (context, v) {
      final t = v * 0.82;
      final rotation = Curves.easeInOut.transform((t / 0.72).clamp(0.0, 1.0)) * 2 * math.pi;
      double o;
      if (t < 0.12) {
        o = 0.9 * (t / 0.12);
      } else if (t < 0.62) {
        o = 0.9;
      } else {
        o = 0.9 * (1 - Curves.easeIn.transform(((t - 0.62) / 0.2).clamp(0.0, 1.0)));
      }
      return Positioned(
        left: r.center.dx - w / 2,
        top: r.center.dy - h / 2,
        width: w,
        height: h,
        child: IgnorePointer(
          child: Opacity(
            opacity: o.clamp(0.0, 1.0),
            child: Transform(
              alignment: Alignment.center,
              transform: Matrix4.diagonal3Values(sign == 1 ? 1 : -1, 1, 1)..rotateZ(rotation),
              child: const CustomPaint(painter: _CometRingPainter()),
            ),
          ),
        ),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: CustomPaint(painter: _ParticlePainter(_particles, _rings, _repaint)),
          ),
          for (final item in _items) item.builder(context, item.controller.value),
        ],
      ),
    );
  }
}

class _ParticlePainter extends CustomPainter {
  _ParticlePainter(this.particles, this.rings, Listenable repaint) : super(repaint: repaint);

  final List<_Particle> particles;
  final List<_Ring> rings;

  @override
  void paint(Canvas canvas, Size size) {
    // Additive blending, soft round sprite with a hot core (PARTICLE_FRAG).
    for (final p in particles) {
      if (p.life <= 0) continue;
      final t = p.life / p.maxLife;
      final s = p.size0 * (0.4 + t * 0.6);
      final paint = Paint()
        ..blendMode = BlendMode.plus
        ..shader = RadialGradient(
          colors: [
            Color.lerp(p.color, Colors.white, 0.6)!.withValues(alpha: t),
            p.color.withValues(alpha: t * 0.7),
            p.color.withValues(alpha: 0),
          ],
          stops: const [0, 0.36, 1],
        ).createShader(Rect.fromCircle(center: Offset(p.x, p.y), radius: s / 2));
      canvas.drawCircle(Offset(p.x, p.y), s / 2, paint);
    }
    // RING_FRAG: ring at radius = progress * R, width shrinking, fading out.
    for (final r in rings) {
      if (!r.active) continue;
      final plane = r.radius * 2;
      final radius = r.progress * 0.5 * plane;
      final width = (0.06 * (1 - r.progress) + 0.012) * plane;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..blendMode = BlendMode.plus
        ..maskFilter = MaskFilter.blur(BlurStyle.normal, width * 0.35)
        ..color = r.color.withValues(alpha: (1 - r.progress).clamp(0.0, 1.0));
      canvas.drawCircle(r.c, radius, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _ParticlePainter oldDelegate) => true;
}

/// box-shadow: inset 0 0 120px 20px (colour)
class _InsetGlowPainter extends CustomPainter {
  _InsetGlowPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.saveLayer(rect, Paint());
    canvas.drawRect(rect, Paint()..color = color);
    canvas.drawRect(
      rect.deflate(20),
      Paint()
        ..blendMode = BlendMode.dstOut
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 60),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _InsetGlowPainter old) => old.color != color;
}

/// conic-gradient(transparent 68%, cyan 100%) masked to a 7px ellipse ring.
class _CometRingPainter extends CustomPainter {
  const _CometRingPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6.5
      ..shader = const SweepGradient(
        colors: [Color(0x0000F3FF), Color(0x0000F3FF), Color(0xD900F3FF)],
        stops: [0, 0.68, 1],
        transform: GradientRotation(-math.pi / 2),
      ).createShader(rect);
    canvas.drawOval(rect.deflate(3.5), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
