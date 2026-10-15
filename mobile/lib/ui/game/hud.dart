// SurveillanceBar.vue, OpponentChip.vue, the HUD exit/audio buttons,
// SettingsButton.vue, StatusPanel.vue and PlayerConsoleBar.vue, at the
// web's phone (<=480px) breakpoint from game-shared.css.

import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../game/badges.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/badge_mark.dart';
import '../widgets/outer_glow.dart';

/// .surveillance-bar: blurred top strip, opponents left, controls right.
class SurveillanceBar extends StatelessWidget {
  const SurveillanceBar({super.key, required this.opponents, required this.controls});

  final List<Widget> opponents;
  final List<Widget> controls;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0xF20A0A0B), Color(0x990A0A0B)],
            ),
            border: Border(bottom: BorderSide(color: Color(0x0FFFFFFF))),
          ),
          padding: EdgeInsets.fromLTRB(
            pad.left > OmSpace.s3 ? pad.left : OmSpace.s3,
            pad.top > OmSpace.s2 ? pad.top : OmSpace.s2,
            pad.right > OmSpace.s3 ? pad.right : OmSpace.s3,
            OmSpace.s2,
          ),
          child: Row(
            children: [
              // .opponents-grid: one scrolling line, room for -6px seat badges.
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  clipBehavior: Clip.none,
                  padding: const EdgeInsets.fromLTRB(6, 6, 0, OmSpace.s1),
                  child: Row(
                    children: [
                      for (final (i, o) in opponents.indexed) ...[
                        if (i > 0) const SizedBox(width: 8),
                        o,
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(width: OmSpace.s2),
              for (final (i, c) in controls.indexed) ...[
                if (i > 0) const SizedBox(width: OmSpace.s1),
                c,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// OpponentChip.vue (.opponent-card) with active / selectable / eliminated /
/// danger states.
class OpponentChip extends StatefulWidget {
  const OpponentChip({
    super.key,
    required this.name,
    required this.cardCount,
    this.badge,
    this.isActive = false,
    this.isSelectable = false,
    this.isEliminated = false,
    this.onTap,
  });

  final String name;
  final int cardCount;
  final BadgeTier? badge;
  final bool isActive;
  final bool isSelectable;
  final bool isEliminated;
  final VoidCallback? onTap;

  @override
  State<OpponentChip> createState() => OpponentChipState();
}

class OpponentChipState extends State<OpponentChip> with TickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this);
  // pulseSeat (scale punch) and the SKIPPED shake are driven from outside.
  late final AnimationController _punch = AnimationController(vsync: this, duration: const Duration(milliseconds: 280));
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 300));

  bool get _danger => !widget.isEliminated && widget.cardCount >= 20;

  @override
  void initState() {
    super.initState();
    _syncPulse();
  }

  @override
  void didUpdateWidget(covariant OpponentChip oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncPulse();
  }

  void _syncPulse() {
    final ms = _danger ? 1400 : (widget.isSelectable ? 1600 : 0);
    if (ms == 0 || motionReduced) {
      _pulse.stop();
      return;
    }
    if (_pulse.duration?.inMilliseconds != ms || !_pulse.isAnimating) {
      _pulse.duration = Duration(milliseconds: ms);
      _pulse.repeat(reverse: true);
    }
  }

  /// useGameFeel.pulseSeat
  void pulse() {
    if (motionReduced) return;
    _punch.forward(from: 0);
  }

  /// The SKIPPED seat shake: x 0 -> -4 -> 4 -> -3 -> 0 over 0.3s.
  void shake() {
    if (motionReduced) return;
    _shake.forward(from: 0);
  }

  @override
  void dispose() {
    _pulse.dispose();
    _punch.dispose();
    _shake.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final w = widget;
    Color border = const Color(0x14FFFFFF);
    Color bg = const Color(0x66000000);
    if (w.isActive) {
      border = OmColors.neonBlue;
      bg = const Color(0x0F00F3FF);
    }
    if (w.isSelectable) border = OmColors.hazard;
    if (w.isEliminated || _danger) border = OmColors.alert;

    Widget avatar = w.badge != null
        ? BadgeMark(badge: w.badge!, size: BadgeSize.mark, emblemSize: 30)
        : Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: w.isActive ? OmColors.neonBlue : const Color(0x0FFFFFFF),
            ),
            child: Text(
              w.name.isEmpty ? '' : w.name[0].toUpperCase(),
              style: displayText(12.8, color: w.isActive ? OmColors.bgConcrete : OmColors.textPrimary),
            ),
          );
    if (w.isEliminated && w.badge == null) {
      avatar = ColorFiltered(colorFilter: _grayscale, child: avatar);
    }

    final countLine = w.isEliminated
        ? Container(
            margin: const EdgeInsets.only(top: 2),
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
            decoration: BoxDecoration(color: OmColors.alert, borderRadius: BorderRadius.circular(4)),
            child: Text('OUT', style: displayText(OmText.xs, color: Colors.white, ls: 0.2)),
          )
        : Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              '${w.cardCount} ${w.cardCount == 1 ? 'card' : 'cards'}',
              style: displayText(OmText.sm, color: w.isActive ? OmColors.neonBlue : OmColors.hazard),
            ),
          );

    final chip = AnimatedBuilder(
      animation: Listenable.merge([_pulse, _punch, _shake]),
      builder: (context, child) {
        final t = Curves.easeInOut.transform(_pulse.value);
        List<BoxShadow> shadows = const [];
        if (_danger) {
          shadows = motionReduced
              ? const [BoxShadow(color: Color(0x80FF2A2A), blurRadius: 16)]
              : [
                  BoxShadow(
                    color: Color.lerp(const Color(0x59FF2A2A), const Color(0x99FF2A2A), t)!,
                    blurRadius: 10 + 12 * t,
                    spreadRadius: 4 * t,
                  ),
                ];
        } else if (w.isSelectable) {
          shadows = [
            BoxShadow(color: Color.lerp(const Color(0x40FFCC00), const Color(0x8CFFCC00), t)!, blurRadius: 8 + 10 * t),
          ];
        } else if (w.isActive) {
          shadows = const [BoxShadow(color: Color(0x4000F3FF), blurRadius: 16)];
        }
        final punch = _punch.value <= 0.5 ? _punch.value * 2 : (1 - _punch.value) * 2;
        final scale = 1 + 0.07 * Curves.easeOut.transform(punch);
        final s = _shake.value;
        final dx = s == 0
            ? 0.0
            : s < 0.25
                ? -4 * (s / 0.25)
                : s < 0.5
                    ? -4 + 8 * ((s - 0.25) / 0.25)
                    : s < 0.75
                        ? 4 - 7 * ((s - 0.5) / 0.25)
                        : -3 + 3 * ((s - 0.75) / 0.25);
        return Transform.translate(
          offset: Offset(dx, 0),
          child: Transform.scale(
            scale: scale,
            child: Opacity(
              opacity: w.isEliminated ? 0.6 : 1,
              child: OuterGlow(
                radius: BorderRadius.circular(OmRadius.pill),
                shadows: shadows,
                child: AnimatedContainer(
                  duration: OmMotion.soft,
                  curve: OmMotion.easeSoft,
                  constraints: const BoxConstraints(minHeight: 44),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6.4),
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(OmRadius.pill),
                    border: Border.all(color: border),
                  ),
                  child: child,
                ),
              ),
            ),
          ),
        );
      },
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          avatar,
          const SizedBox(width: 6.4),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 130),
                child: Text(
                  w.name.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: monoText(11.2, ls: 0.15, height: 1.1),
                ),
              ),
              countLine,
            ],
          ),
        ],
      ),
    );

    return Semantics(
      button: w.isSelectable,
      label: '${w.name}, ${w.cardCount} cards${w.isActive ? ', current turn' : ''}',
      child: GestureDetector(onTap: w.onTap, child: chip),
    );
  }
}

const _grayscale = ColorFilter.matrix(<double>[
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
]);

/// .hud-exit
class HudExitButton extends StatelessWidget {
  const HudExitButton({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _HudSquare(
        tooltip: 'Leave game',
        onTap: onTap,
        border: const Color(0xFF333333),
        child: const Icon(LucideIcons.logOut, size: OmIcon.button, color: OmColors.textSecondary),
      );
}

/// .hud-audio - the "AUDIO" label is dropped at phone widths.
class HudAudioButton extends StatelessWidget {
  const HudAudioButton({super.key, required this.active, required this.onTap});
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _HudSquare(
        tooltip: active ? 'Mute audio' : 'Unmute audio',
        onTap: onTap,
        border: const Color(0xFF333333),
        child: AnimatedContainer(
          duration: OmMotion.snap,
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: active ? OmColors.neonBlue : const Color(0xFF333333),
            boxShadow: active ? const [BoxShadow(color: OmColors.neonBlue, blurRadius: 8)] : null,
          ),
        ),
      );
}

/// SettingsButton.vue
class SettingsButton extends StatelessWidget {
  const SettingsButton({super.key});

  @override
  Widget build(BuildContext context) => _HudSquare(
        tooltip: 'Settings',
        onTap: SettingsStore.instance.open,
        border: const Color(0x4DFFCC00),
        child: const Icon(LucideIcons.settings, size: OmIcon.iconButton, color: OmColors.hazard),
      );
}

class _HudSquare extends StatelessWidget {
  const _HudSquare({required this.tooltip, required this.onTap, required this.border, required this.child});

  final String tooltip;
  final VoidCallback onTap;
  final Color border;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0x80000000),
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(OmRadius.sm),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// StatusPanel.vue - the 2rem ticker row: turn pill + alert text.
class StatusTicker extends StatefulWidget {
  const StatusTicker({super.key, required this.turnLabel, required this.turnIsMine, required this.message, this.messageColor});

  final String turnLabel;
  final bool turnIsMine;
  final String message;

  /// Roulette drawing: colour + 1rem + glow (GameView.messageStyle).
  final Color? messageColor;

  @override
  State<StatusTicker> createState() => _StatusTickerState();
}

class _StatusTickerState extends State<StatusTicker> with SingleTickerProviderStateMixin {
  late final AnimationController _think = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant StatusTicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    if (!widget.turnIsMine && !motionReduced) {
      if (!_think.isAnimating) _think.repeat(reverse: true);
    } else {
      _think.stop();
      _think.value = 1;
    }
  }

  @override
  void dispose() {
    _think.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mine = widget.turnIsMine;
    final pillColor = mine ? const Color(0xFF00FF66) : OmColors.textSecondary;
    final msgColor = widget.messageColor ?? OmColors.alert;
    return SizedBox(
      height: 32,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: OmSpace.s3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (widget.turnLabel.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 11.2, vertical: 3.2),
                decoration: BoxDecoration(
                  color: mine ? const Color(0x1F00FF66) : const Color(0x0FFFFFFF),
                  border: Border.all(color: mine ? const Color(0x6600FF66) : const Color(0x1FFFFFFF)),
                  borderRadius: BorderRadius.circular(OmRadius.pill),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedBuilder(
                      animation: _think,
                      builder: (context, _) {
                        final t = mine ? 1.0 : Curves.easeInOut.transform(_think.value);
                        return Opacity(
                          opacity: 0.35 + 0.65 * t,
                          child: Transform.scale(
                            scale: 0.7 + 0.3 * t,
                            child: Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(color: pillColor, shape: BoxShape.circle),
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(width: 6.4),
                    Text(widget.turnLabel.toUpperCase(), style: monoText(10.9, color: pillColor, ls: 0.16)),
                  ],
                ),
              ),
            if (widget.turnLabel.isNotEmpty && widget.message.isNotEmpty) const SizedBox(width: OmSpace.s3),
            Flexible(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                switchInCurve: OmMotion.easeSoft,
                switchOutCurve: OmMotion.easeSoft,
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween(begin: const Offset(0, -0.25), end: Offset.zero).animate(anim),
                    child: child,
                  ),
                ),
                child: widget.message.isEmpty
                    ? const SizedBox.shrink(key: ValueKey(''))
                    : Text(
                        widget.message,
                        key: ValueKey(widget.message),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: monoText(
                          widget.messageColor != null ? 16 : 11.5,
                          color: msgColor,
                          ls: 0.06,
                        ).copyWith(
                          shadows: [
                            Shadow(
                              color: widget.messageColor ?? const Color(0x66FF2A2A),
                              blurRadius: 10,
                            ),
                          ],
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// PlayerConsoleBar.vue - CAUGHT! centred, MERCY! pinned right.
class ConsoleBar extends StatelessWidget {
  const ConsoleBar({super.key, required this.showUnoButton, required this.onCallUno, this.caughtName, this.onCatch});

  final bool showUnoButton;
  final VoidCallback onCallUno;
  final String? caughtName;
  final VoidCallback? onCatch;

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        pad.left > OmSpace.s3 ? pad.left : OmSpace.s3,
        OmSpace.s2,
        pad.right > OmSpace.s3 ? pad.right : OmSpace.s3,
        pad.bottom > OmSpace.s2 ? pad.bottom : OmSpace.s2,
      ),
      child: Row(
        children: [
          const Expanded(child: SizedBox()),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 180),
            transitionBuilder: (child, a) => FadeTransition(
              opacity: a,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.3), end: Offset.zero).animate(a),
                child: child,
              ),
            ),
            child: caughtName == null
                ? const SizedBox.shrink()
                : _CatchButton(key: ValueKey(caughtName), name: caughtName!, onTap: onCatch),
          ),
          Expanded(
            child: Align(
              alignment: Alignment.centerRight,
              child: showUnoButton ? _MercyButton(onTap: onCallUno) : const SizedBox.shrink(),
            ),
          ),
        ],
      ),
    );
  }
}

class _MercyButton extends StatelessWidget {
  const _MercyButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        height: 56,
        // The web's red box-shadow sits under a clip-path, which clips it away.
        child: ClipPath(
            clipper: const _ParallelogramClip(),
            // Sized to its text like the web's inline-flex button; an aligned
            // Container would stretch to the whole dock cell.
            child: Container(
              constraints: const BoxConstraints(minWidth: 56),
              color: OmColors.alert,
              padding: const EdgeInsets.symmetric(horizontal: 22.4, vertical: 3.2),
              child: Center(widthFactor: 1, child: Text('MERCY!', style: displayText(14.4, color: Colors.white))),
            ),
          ),
      ),
    );
  }
}

/// clip-path: polygon(0 0, 90% 0, 100% 100%, 10% 100%)
class _ParallelogramClip extends CustomClipper<Path> {
  const _ParallelogramClip();
  @override
  Path getClip(Size s) => Path()
    ..moveTo(0, 0)
    ..lineTo(s.width * 0.9, 0)
    ..lineTo(s.width, s.height)
    ..lineTo(s.width * 0.1, s.height)
    ..close();
  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class _CatchButton extends StatefulWidget {
  const _CatchButton({super.key, required this.name, required this.onTap});
  final String name;
  final VoidCallback? onTap;

  @override
  State<_CatchButton> createState() => _CatchButtonState();
}

class _CatchButtonState extends State<_CatchButton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));

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
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) =>
            Transform.scale(scale: 1 + 0.06 * Curves.easeInOut.transform(_c.value), child: child),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 17.6, vertical: 8),
          decoration: BoxDecoration(
            color: OmColors.alert,
            borderRadius: BorderRadius.circular(999),
            boxShadow: const [BoxShadow(color: Color(0x80FF2A2A), offset: Offset(0, 6), blurRadius: 24)],
          ),
          child: Text(
            'CAUGHT! ${widget.name} forgot MERCY',
            maxLines: 1,
            style: displayText(11.5, color: Colors.white, ls: 0.06),
          ),
        ),
      ),
    );
  }
}
