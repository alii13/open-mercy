// StackCam.vue, BadgeUpBanner.vue and useStackEscalation.ts (vignette).

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart' hide Card;
import 'package:flutter/scheduler.dart';

import '../../engine/types.dart';
import '../../game/badges.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/badge_mark.dart';
import '../widgets/rolling_number.dart';
import 'fx_overlay.dart';

enum _CamPhase { idle, active, reveal }

/// Stack cam: lights up while the draw stack is at cinematic size (>= 10).
class StackCam extends StatefulWidget {
  const StackCam({super.key, required this.fx});
  final GlobalKey<FxOverlayState> fx;

  @override
  State<StackCam> createState() => StackCamState();
}

class StackCamState extends State<StackCam> with TickerProviderStateMixin {
  _CamPhase _phase = _CamPhase.idle;
  int _amount = 0;
  CardColor _color = CardColor.red;
  String _victimName = '';
  final List<Timer> _timers = [];
  Ticker? _ramp;

  Color get _accent => fxColor(_color);

  void _after(int ms, VoidCallback fn) => _timers.add(Timer(Duration(milliseconds: ms), fn));

  void _clearTimers() {
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
  }

  /// gsap.globalTimeline.timeScale(from -> to) over real ms, ease out cubic.
  /// Flutter's equivalent of the global time scale is timeDilation.
  void _rampTimeScale(double from, double to, int ms) {
    _ramp?.dispose();
    timeDilation = 1 / from;
    _ramp = createTicker((elapsed) {
      final t = math.min(1.0, elapsed.inMilliseconds / ms);
      final eased = 1 - math.pow(1 - t, 3).toDouble();
      timeDilation = 1 / (from + (to - from) * eased);
      if (t >= 1) {
        _ramp?.stop();
        timeDilation = 1;
      }
    })
      ..start();
  }

  void standDown() {
    _clearTimers();
    _ramp?.stop();
    timeDilation = 1;
    if (mounted) setState(() => _phase = _CamPhase.idle);
  }

  void ignite(int amount, CardColor color) {
    setState(() {
      _amount = amount;
      _color = color;
    });
    if (_phase == _CamPhase.active) return;
    setState(() => _phase = _CamPhase.active);
    if (motionReduced) return;
    _rampTimeScale(0.3, 1, 480);
  }

  void reveal(int amount, CardColor color, Rect? victim, String name, Rect? pile) {
    setState(() {
      _amount = amount;
      _color = color;
      _victimName = name;
    });
    if (victim == null) {
      standDown();
      return;
    }
    setState(() => _phase = _CamPhase.reveal);
    final fx = widget.fx.currentState;
    if (!motionReduced && fx != null && pile != null) {
      fx.spray(pile.center, victim.center, color, math.min(amount * 4, 60));
      _after(180, () => fx.burst(victim.center, color, 18));
    }
    _after(motionReduced ? 1100 : 1600, standDown);
  }

  @override
  void dispose() {
    _clearTimers();
    _ramp?.dispose();
    timeDilation = 1;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final active = _phase != _CamPhase.idle;
    final revealing = _phase == _CamPhase.reveal;
    final reduced = motionReduced;
    final potSize = (size.width * 0.09).clamp(38.4, 80.0);
    final bannerSize = (size.width * 0.06).clamp(25.6, 51.2);
    final barH = size.height * 0.09;

    return IgnorePointer(
      ignoring: !revealing,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: revealing ? standDown : null,
        child: Stack(
          children: [
            // Radial spotlight dim.
            Positioned.fill(
              child: AnimatedOpacity(
                duration: const Duration(milliseconds: 400),
                curve: Curves.easeOut,
                opacity: revealing ? 1 : (active ? 0.5 : 0),
                child: const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      radius: 0.5,
                      transform: CssRadial.ellipse(),
                      colors: [Color(0x00000000), Color(0xB8000000)],
                      stops: [0.2, 0.78],
                    ),
                  ),
                ),
              ),
            ),
            // Letterbox bars.
            AnimatedPositioned(
              duration: reduced ? Duration.zero : const Duration(milliseconds: 420),
              curve: const Cubic(0.16, 1, 0.3, 1),
              left: 0,
              right: 0,
              top: active && !reduced ? 0 : -barH,
              height: barH,
              child: const ColoredBox(color: Colors.black),
            ),
            AnimatedPositioned(
              duration: reduced ? Duration.zero : const Duration(milliseconds: 420),
              curve: const Cubic(0.16, 1, 0.3, 1),
              left: 0,
              right: 0,
              bottom: active && !reduced ? 0 : -barH,
              height: barH,
              child: const ColoredBox(color: Colors.black),
            ),
            // The pot counter.
            Positioned(
              left: 0,
              right: 0,
              top: size.height * 0.16,
              child: Center(
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 240),
                  opacity: active ? 1 : 0,
                  child: AnimatedSlide(
                    duration: const Duration(milliseconds: 320),
                    curve: OmMotion.easeBounce,
                    offset: Offset(0, active ? 0 : -20 / potSize),
                    child: AnimatedScale(
                      duration: const Duration(milliseconds: 320),
                      curve: OmMotion.easeBounce,
                      scale: active ? 1 : 0.6,
                      child: _glow(
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Text('+', style: displayText(potSize * 0.6, color: _accent.withValues(alpha: 0.85))),
                            RollingNumber(value: _amount, style: displayText(potSize, color: _accent)),
                            SizedBox(width: potSize * 0.28 * 0.4 * 2.5),
                            Text('STACK',
                                style: displayText(potSize * 0.28, color: _accent.withValues(alpha: 0.8), ls: 0.4)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            // The victim reveal banner.
            Positioned.fill(
              child: Center(
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 220),
                  opacity: revealing ? 1 : 0,
                  child: AnimatedScale(
                    duration: const Duration(milliseconds: 280),
                    curve: const Cubic(0.16, 1, 0.3, 1),
                    scale: revealing || reduced ? 1 : 1.35,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: size.width * 0.94),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('+$_amount', style: _bannerStyle(bannerSize, _accent)),
                          SizedBox(width: bannerSize * 0.4),
                          Text('▸', style: _bannerStyle(bannerSize, _accent.withValues(alpha: 0.8))),
                          SizedBox(width: bannerSize * 0.4),
                          Flexible(
                            child: Text(
                              _victimName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: _bannerStyle(bannerSize, Colors.white),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  TextStyle _bannerStyle(double size, Color color) => displayText(size, color: color, ls: 0.06).copyWith(
        shadows: [
          Shadow(color: _accent, blurRadius: 24),
          const Shadow(color: Color(0xCC000000), offset: Offset(0, 4), blurRadius: 14),
        ],
      );

  /// filter: drop-shadow(0 0 16px accent) drop-shadow(0 4px 10px black)
  Widget _glow(Widget child) => DecoratedBox(
        decoration: BoxDecoration(
          boxShadow: [BoxShadow(color: _accent.withValues(alpha: 0.35), blurRadius: 32, spreadRadius: -8)],
        ),
        child: child,
      );
}

/// BadgeUpBanner.vue - queued tier-up celebrations.
class BadgeUpBanner extends StatefulWidget {
  const BadgeUpBanner({super.key, required this.fx});
  final GlobalKey<FxOverlayState> fx;

  @override
  State<BadgeUpBanner> createState() => BadgeUpBannerState();
}

class _BadgeItem {
  const _BadgeItem(this.name, this.tier, this.self);
  final String name;
  final int tier;
  final bool self;
}

class BadgeUpBannerState extends State<BadgeUpBanner> with TickerProviderStateMixin {
  final List<_BadgeItem> _queue = [];
  _BadgeItem? _current;
  bool _playing = false;
  Timer? _hold;
  late final AnimationController _in = AnimationController(vsync: this, duration: const Duration(milliseconds: 730));
  late final AnimationController _out = AnimationController(vsync: this, duration: const Duration(milliseconds: 340));
  final _cardKey = GlobalKey();

  void enqueue(String name, int tier, bool self) {
    if (_queue.any((q) => q.name == name && q.tier == tier)) return;
    _queue.add(_BadgeItem(name, tier, self));
    if (!_playing) _advance();
  }

  void _advance() {
    _hold?.cancel();
    if (_queue.isEmpty) {
      setState(() {
        _playing = false;
        _current = null;
      });
      return;
    }
    final next = _queue.removeAt(0);
    setState(() {
      _playing = true;
      _current = next;
    });
    _out.value = 0;
    if (motionReduced) {
      _in.value = 1;
    } else {
      _in.forward(from: 0);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final box = _cardKey.currentContext?.findRenderObject() as RenderBox?;
        if (box != null && box.attached) {
          final c = box.localToGlobal(box.size.center(Offset.zero));
          widget.fx.currentState?.confetti(c, next.self ? 120 : 60);
        }
      });
    }
    _hold = Timer(Duration(milliseconds: next.self ? 2600 : 2000), _leave);
  }

  void _leave() {
    if (motionReduced) {
      _advance();
      return;
    }
    _out.forward(from: 0).whenComplete(() {
      if (mounted) _advance();
    });
  }

  void _skip() {
    _hold?.cancel();
    _leave();
  }

  @override
  void dispose() {
    _hold?.cancel();
    _in.dispose();
    _out.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = _current;
    if (item == null) return const SizedBox.shrink();
    final badge = badges[(item.tier - 1).clamp(0, badges.length - 1)];
    final size = MediaQuery.sizeOf(context);

    final card = AnimatedBuilder(
      animation: Listenable.merge([_in, _out]),
      builder: (context, child) {
        // from scale .35 / y 44 (self) or -18 / rotate -6 over 0.5s back.out,
        // then a 1.04 yoyo punch.
        final t = _in.value * 0.73;
        double s, y, r, o;
        if (t < 0.5) {
          final p = const Cubic(0.34, 1.56, 0.64, 1).transform(t / 0.5);
          s = 0.35 + 0.65 * p;
          y = (item.self ? 44 : -18) * (1 - p);
          r = (item.self ? -6 : 0) * (1 - p);
          o = (t / 0.5).clamp(0.0, 1.0);
        } else {
          final k = ((t - 0.45) / 0.28).clamp(0.0, 1.0);
          s = 1 + 0.04 * math.sin(k * math.pi);
          y = 0;
          r = 0;
          o = 1;
        }
        final out = Curves.easeIn.transform(_out.value);
        o *= 1 - out;
        y += -16 * out;
        s *= 1 - 0.04 * out;
        return Opacity(
          opacity: o.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, y),
            child: Transform.rotate(angle: r * math.pi / 180, child: Transform.scale(scale: s, child: child)),
          ),
        );
      },
      child: GestureDetector(
        onTap: _skip,
        child: Container(
          key: _cardKey,
          constraints: BoxConstraints(maxWidth: size.width * 0.9),
          padding: item.self
              ? const EdgeInsets.symmetric(horizontal: OmSpace.s8, vertical: OmSpace.s6)
              : const EdgeInsets.symmetric(horizontal: OmSpace.s6, vertical: OmSpace.s3),
          decoration: BoxDecoration(
            color: const Color(0xD10A0A0B),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: badge.color.withValues(alpha: 0.55)),
            boxShadow: [
              const BoxShadow(color: Color(0x8C000000), offset: Offset(0, 10), blurRadius: 40),
              BoxShadow(color: badge.color.withValues(alpha: 0.25), blurRadius: 30),
            ],
          ),
          child: Material(
            type: MaterialType.transparency,
            child: Flex(
              direction: item.self ? Axis.vertical : Axis.horizontal,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (item.self) ...[
                  Text('BADGE UNLOCKED',
                      style: monoText(9.9, color: Color.lerp(badge.color, Colors.white, 0.2)!, ls: 0.32)),
                  const SizedBox(height: OmSpace.s3),
                ],
                BadgeMark(badge: badge, size: BadgeSize.full),
                SizedBox(width: item.self ? 0 : OmSpace.s4, height: item.self ? OmSpace.s3 : 0),
                Text.rich(
                  TextSpan(
                    style: monoText(16),
                    children: [
                      TextSpan(text: item.name, style: monoText(16, color: Colors.white, weight: FontWeight.bold)),
                      const TextSpan(text: ' reached '),
                      if (item.self) const TextSpan(text: '\n'),
                      TextSpan(
                        text: badge.title,
                        style: displayText(item.self ? 24 : 16, color: badge.color, ls: 0.08).copyWith(
                          shadows: [Shadow(color: badge.color.withValues(alpha: 0.6), blurRadius: 18)],
                        ),
                      ),
                    ],
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return Positioned.fill(
      child: Align(
        alignment: item.self ? Alignment.center : Alignment.topCenter,
        child: Padding(
          padding: EdgeInsets.only(top: item.self ? 0 : size.height * 0.12),
          child: card,
        ),
      ),
    );
  }
}

/// The red edge vignette that tracks the draw stack (useStackEscalation).
class StackVignette extends StatelessWidget {
  const StackVignette({super.key, required this.drawStack});
  final int drawStack;

  @override
  Widget build(BuildContext context) {
    final intensity = drawStack >= 14
        ? 1.0
        : drawStack >= 8
            ? 0.7
            : drawStack >= 4
                ? 0.4
                : 0.0;
    final opacity = motionReduced ? math.min(intensity * 0.5, 0.4) : intensity;
    return IgnorePointer(
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOut,
        opacity: opacity,
        child: const DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              radius: 0.5,
              transform: CssRadial.ellipse(),
              colors: [Color(0x00FF2A2A), Color(0x8CFF2A2A)],
              stops: [0.5, 1],
            ),
          ),
        ),
      ),
    );
  }
}
