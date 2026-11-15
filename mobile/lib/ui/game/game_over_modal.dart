// GameOverModal.vue, solo ('sp') mode.

import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../game/share_image.dart';
import '../../services/prefs.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/brand_icons.dart';

class GameOverStats {
  const GameOverStats({required this.cardsPlayed, required this.biggestStack, required this.unosCalled, required this.peakHand});
  final int cardsPlayed;
  final int biggestStack;
  final int unosCalled;
  final int peakHand;
}

const _lossQuotes = [
  'Mercy is for cowards.',
  'You played. You lost. That’s the entire story.',
  'The bot does not forgive.',
  'Run it back. Or don’t. The deck doesn’t care.',
  'Some hands you fold. This was one of them.',
  'You came for a card game. You got a beatdown.',
  'Defeat tastes like every other day.',
  'The house always wins. Today the house was a bot.',
];

const _claimKey = 'om_claim_spotlight_shown';

/// utils/claimSpotlight.ts
bool shouldSpotlightClaim(bool isAnonymous, bool isWinner) {
  if (!isAnonymous || !isWinner) return false;
  return Prefs.instance.getString(_claimKey) == null;
}

void markClaimSpotlightShown() => Prefs.instance.setString(_claimKey, '1');

class GameOverModal extends StatefulWidget {
  const GameOverModal({
    super.key,
    required this.isWinner,
    required this.winnerName,
    required this.opponentName,
    required this.stats,
    required this.isAnonymous,
    required this.onRematch,
    required this.onBackToLobby,
    required this.onUpgradeAccount,
    this.daily,
    this.onPlayDaily,
  });

  final bool isWinner;
  final String winnerName;
  final String opponentName;
  final GameOverStats? stats;
  final bool isAnonymous;

  /// Today's-deal nudge (streak), or null to hide it.
  final int? daily;
  final VoidCallback onRematch;
  final VoidCallback onBackToLobby;
  final VoidCallback onUpgradeAccount;
  final VoidCallback? onPlayDaily;

  @override
  State<GameOverModal> createState() => _GameOverModalState();
}

class _GameOverModalState extends State<GameOverModal> with TickerProviderStateMixin {
  late final AnimationController _overlay = AnimationController(vsync: this, duration: const Duration(milliseconds: 250));
  late final AnimationController _card = AnimationController(vsync: this, duration: const Duration(milliseconds: 350));
  late final AnimationController _stamp = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
  late final AnimationController _stats = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));
  late final AnimationController _confetti = AnimationController(vsync: this, duration: const Duration(seconds: 4));

  final String _villainQuote = _lossQuotes[math.Random().nextInt(_lossQuotes.length)];
  bool _claimSpotlight = false;
  bool _generating = false;
  bool _sharingX = false;
  bool _sharingWa = false;

  @override
  void initState() {
    super.initState();
    _claimSpotlight = shouldSpotlightClaim(widget.isAnonymous, widget.isWinner);
    if (_claimSpotlight) markClaimSpotlightShown();
    if (motionReduced) {
      _overlay.value = 1;
      _card.value = 1;
      _stamp.value = 1;
      _stats.value = 1;
    } else {
      _overlay.forward();
      _card.forward();
      _stamp.forward();
      _stats.forward();
      if (widget.isWinner) _confetti.forward();
    }
  }

  @override
  void dispose() {
    _overlay.dispose();
    _card.dispose();
    _stamp.dispose();
    _stats.dispose();
    _confetti.dispose();
    super.dispose();
  }

  String get _stampSub => widget.isWinner ? 'NO MERCY DEALT' : 'NO MERCY SHOWN';

  ShareImagePayload get _payload => ShareImagePayload(
        isWinner: widget.isWinner,
        opponentName: widget.opponentName,
        cardsPlayed: widget.stats?.cardsPlayed ?? 0,
        biggestStack: widget.stats?.biggestStack ?? 0,
        unosCalled: widget.stats?.unosCalled ?? 0,
        peakHand: widget.stats?.peakHand ?? 0,
      );

  static const _siteUrl = 'https://open-mercy.com';
  static const _shareText = 'Just destroyed the bot in Open Mercy. No mercy given. Play me if you dare.';

  Future<XFile?> _imageFile() async {
    final bytes = await generateShareImage(_payload);
    if (bytes == null) return null;
    final dir = await getTemporaryDirectory();
    final f = File('${dir.path}/open-mercy-win.png');
    await f.writeAsBytes(bytes);
    return XFile(f.path, mimeType: 'image/png');
  }

  /// On a phone the web takes the native share sheet with the image + text.
  Future<void> _shareWithImage() async {
    final file = await _imageFile();
    if (file == null) return;
    await SharePlus.instance.share(ShareParams(files: [file], title: 'Open Mercy', text: '$_shareText\n\n$_siteUrl'));
  }

  Future<void> _onShareX() async {
    if (_sharingX) return;
    setState(() => _sharingX = true);
    try {
      await _shareWithImage();
    } catch (e) {
      // A cancelled or failed share sheet is not worth an error to the player.
      debugPrint('share failed: $e');
    } finally {
      if (mounted) setState(() => _sharingX = false);
    }
  }

  Future<void> _onShareWhatsApp() async {
    if (_sharingWa) return;
    setState(() => _sharingWa = true);
    try {
      await _shareWithImage();
    } catch (e) {
      // A cancelled or failed share sheet is not worth an error to the player.
      debugPrint('share failed: $e');
    } finally {
      if (mounted) setState(() => _sharingWa = false);
    }
  }

  Future<void> _onShareImage() async {
    if (_generating) return;
    setState(() => _generating = true);
    try {
      final file = await _imageFile();
      if (file != null) {
        await SharePlus.instance.share(ShareParams(files: [file], title: 'Open Mercy', text: 'I just won at Open Mercy.'));
      }
    } catch (e) {
      debugPrint('share failed: $e');
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final win = widget.isWinner;
    final accent = win ? const Color(0xFFFFCC00) : const Color(0xFFFF2A2A);
    final size = MediaQuery.sizeOf(context);
    final h1 = (size.width * 0.08).clamp(38.4, 57.6);

    return FadeTransition(
      opacity: _overlay,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onBackToLobby,
        child: Container(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              radius: 0.5,
              transform: const CssRadial.ellipse(),
              colors: win
                  ? const [Color(0x2EFFCC00), Color(0xD9000000)]
                  : const [Color(0x2EFF2A2A), Color(0xE0000000)],
              stops: const [0, 0.6],
            ),
          ),
          child: Stack(
            children: [
              if (win) Positioned.fill(child: _ConfettiLayer(controller: _confetti)),
              Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(OmSpace.s4),
                  child: GestureDetector(
                    onTap: () {},
                    child: AnimatedBuilder(
                      animation: _card,
                      builder: (context, child) {
                        final p = const Cubic(0.165, 0.84, 0.44, 1).transform(_card.value);
                        return Opacity(
                          opacity: p,
                          child: Transform.translate(offset: Offset(0, 30 * (1 - p)), child: child),
                        );
                      },
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 440),
                        padding: const EdgeInsets.fromLTRB(28, 32, 28, 24),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Color(0xFF18191B), Color(0xFF0A0A0B)],
                          ),
                          border: Border.all(color: const Color(0x14FFFFFF)),
                          borderRadius: BorderRadius.circular(4),
                          boxShadow: [BoxShadow(color: accent.withValues(alpha: 0.18), blurRadius: 50)],
                        ),
                        child: Material(
                          type: MaterialType.transparency,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _stampWidget(h1, accent),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(0, 12, 0, 24),
                                child: Text(
                                  win ? 'You showed no mercy.' : _villainQuote,
                                  textAlign: TextAlign.center,
                                  style: bodyText(15.2, color: OmColors.textSecondary),
                                ),
                              ),
                              if (widget.stats != null) _statsGrid(win),
                              _cta(win),
                              if (win) _shareRow(),
                              if (widget.daily != null && !_claimSpotlight) _dailyNudge(),
                              if (_claimSpotlight) _claimNudge(),
                              _footer(),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stampWidget(double h1, Color accent) {
    return AnimatedBuilder(
      animation: _stamp,
      builder: (context, child) {
        // stamp-in: scale 2.5 rot -8 -> 0.92 rot -3 (60%) -> 1 rot -4
        final v = const Cubic(0.34, 1.56, 0.64, 1).transform(_stamp.value);
        double scale, rot, op;
        if (_stamp.value < 0.6) {
          final p = (v / 0.6).clamp(0.0, 1.0);
          scale = 2.5 + (0.92 - 2.5) * p;
          rot = -8 + 5 * p;
          op = (_stamp.value / 0.6).clamp(0.0, 1.0);
        } else {
          final p = ((_stamp.value - 0.6) / 0.4).clamp(0.0, 1.0);
          scale = 0.92 + 0.08 * p;
          rot = -3 - 1 * p;
          op = 1;
        }
        return Opacity(
          opacity: op,
          child: Transform.rotate(angle: rot * math.pi / 180, child: Transform.scale(scale: scale, child: child)),
        );
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
        child: Column(
          children: [
            Text(
              widget.isWinner ? 'VICTORY' : 'DEFEATED',
              style: displayText(h1, color: accent, ls: 0.06, height: 0.95).copyWith(
                shadows: [
                  Shadow(color: accent.withValues(alpha: 0.6), blurRadius: 25),
                  Shadow(color: accent.withValues(alpha: 0.9), blurRadius: 4),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Text(_stampSub, style: bodyText(11.5, color: const Color(0x66FFFFFF), ls: 0.4)),
          ],
        ),
      ),
    );
  }

  Widget _statsGrid(bool win) {
    final s = widget.stats!;
    final cells = [
      (s.cardsPlayed, 'CARDS PLAYED'),
      (s.biggestStack, 'BIGGEST STACK'),
      (s.unosCalled, 'MERCY CALLS'),
      (s.peakHand, 'PEAK HAND'),
    ];
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 0, 0, 24),
      padding: const EdgeInsets.symmetric(vertical: 13.6),
      decoration: const BoxDecoration(
        border: Border.symmetric(horizontal: BorderSide(color: Color(0x12FFFFFF))),
      ),
      child: AnimatedBuilder(
        animation: _stats,
        builder: (context, _) {
          // 0.9s tick-up after a 0.3s delay, power2.out, snapped to ints.
          final t = ((_stats.value * 1.2 - 0.3) / 0.9).clamp(0.0, 1.0);
          final p = const Cubic(0.215, 0.61, 0.355, 1).transform(t);
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (value, label) in cells)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6.4, vertical: 4),
                    child: Column(
                      children: [
                        Text('${(value * p).round()}',
                            style: displayText(25.6, color: win ? OmColors.hazard : OmColors.textPrimary, height: 1)),
                        const SizedBox(height: 5.6),
                        Text(label,
                            textAlign: TextAlign.center,
                            style: bodyText(9.6, color: OmColors.textMuted, ls: 0.18)),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _cta(bool win) {
    return GestureDetector(
      onTap: widget.onRematch,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: win ? OmColors.hazard : OmColors.alert,
          border: Border.all(color: win ? OmColors.hazard : OmColors.alert, width: 2),
          boxShadow: [BoxShadow(color: (win ? OmColors.hazard : OmColors.alert).withValues(alpha: 0.45), blurRadius: 30)],
        ),
        alignment: Alignment.center,
        child: Text('REMATCH', style: displayText(17.6, color: win ? OmColors.bgConcrete : Colors.white, ls: 0.15)),
      ),
    );
  }

  Widget _shareBtn({required Widget child, required VoidCallback onTap, required bool disabled, double? minWidth}) {
    final btn = GestureDetector(
          onTap: disabled ? null : onTap,
          child: Opacity(
            opacity: disabled ? 0.5 : 1,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10.4, horizontal: 8),
              decoration: BoxDecoration(border: Border.all(color: const Color(0x1FFFFFFF))),
              alignment: Alignment.center,
              child: child,
            ),
          ),
        );
    // flex: 1 with min-width: auto - an item never shrinks below its content.
    return minWidth == null ? Expanded(child: btn) : ConstrainedBox(constraints: BoxConstraints(minWidth: minWidth), child: btn);
  }

  Widget _shareRow() {
    final style = bodyText(12.8, color: const Color(0xB3FFFFFF), ls: 0.12, weight: FontWeight.w500);
    return Padding(
      padding: const EdgeInsets.only(top: 13.6),
      child: LayoutBuilder(builder: (context, box) => Row(
        children: [
          _shareBtn(
            onTap: _onShareX,
            disabled: _sharingX,
            child: Semantics(label: 'Share on X', child: const BrandIcon(BrandIcons.x, size: 18, color: Color(0xB3FFFFFF))),
          ),
          const SizedBox(width: 8),
          _shareBtn(
            onTap: _onShareWhatsApp,
            disabled: _sharingWa,
            minWidth: (box.maxWidth - 16) / 3,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const BrandIcon(BrandIcons.whatsapp, size: 18, color: Color(0xB3FFFFFF)),
              const SizedBox(width: 6.4),
              Text('WHATSAPP', style: style),
            ]),
          ),
          const SizedBox(width: 8),
          _shareBtn(
            onTap: _onShareImage,
            disabled: _generating,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(LucideIcons.imageDown, size: 18, color: Color(0xB3FFFFFF)),
              const SizedBox(width: 6.4),
              Text(_generating ? '…' : 'IMAGE', style: style),
            ]),
          ),
        ],
      )),
    );
  }

  Widget _nudge({
    required Color border,
    required List<Color> bg,
    required Widget title,
    required String sub,
    required String button,
    required Color buttonColor,
    required Color buttonBorder,
    required VoidCallback? onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(top: 13.6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10.4),
      decoration: BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: bg),
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(OmRadius.md),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                title,
                const SizedBox(height: 3.2),
                Text(sub, style: bodyText(12, color: const Color(0x8CFFFFFF))),
              ],
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8.8),
              decoration: BoxDecoration(
                border: Border.all(color: buttonBorder),
                borderRadius: BorderRadius.circular(OmRadius.sm),
              ),
              child: Text(button, style: bodyText(12.8, color: buttonColor, ls: 0.12, weight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _dailyNudge() {
    final streak = widget.daily ?? 0;
    return _nudge(
      border: const Color(0x24FFCC00),
      bg: const [Color(0x0DFFCC00), Color(0x05FFFFFF)],
      title: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 5.6,
        children: [
          const Icon(LucideIcons.flame, size: OmIcon.inline, color: OmColors.hazard),
          Text("TODAY'S DEAL", style: displayText(12.8, color: OmColors.hazard, ls: 0.12)),
          if (streak > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7.2, vertical: 0.8),
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0x40FFCC00)),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text('$streak-DAY STREAK', style: bodyText(10.4, color: const Color(0xBFFFCC00), ls: 0.08)),
            ),
        ],
      ),
      sub: 'The same shuffle for the whole world. One scored attempt.',
      button: 'PLAY',
      buttonColor: OmColors.hazard,
      buttonBorder: const Color(0x66FFCC00),
      onTap: widget.onPlayDaily,
    );
  }

  Widget _claimNudge() => _nudge(
        border: const Color(0x2EFFFFFF),
        bg: const [Color(0x12FFFFFF), Color(0x05FFFFFF)],
        title: Row(mainAxisSize: MainAxisSize.min, children: [
          const Icon(LucideIcons.userPlus, size: OmIcon.inline, color: Colors.white),
          const SizedBox(width: 5.6),
          Text('FIRST WIN LOGGED', style: displayText(12.8, color: Colors.white, ls: 0.12)),
        ]),
        sub: 'It lives on this guest session only. Sign in to keep your stats, streak and share card.',
        button: 'SAVE MY STATS',
        buttonColor: Colors.white,
        buttonBorder: const Color(0x66FFFFFF),
        onTap: widget.onUpgradeAccount,
      );

  Widget _footer() {
    final link = bodyText(12.5, color: OmColors.textMuted, ls: 0.08);
    return Container(
      margin: const EdgeInsets.only(top: 24),
      padding: const EdgeInsets.only(top: 13.6),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0x0DFFFFFF)))),
      child: Wrap(
        alignment: WrapAlignment.center,
        spacing: 24,
        children: [
          GestureDetector(
            onTap: widget.onBackToLobby,
            child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text('BACK TO MENU', style: link)),
          ),
          if (widget.isAnonymous && !_claimSpotlight)
            GestureDetector(
              onTap: widget.onUpgradeAccount,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text('SAVE YOUR STATS', style: link),
                  const SizedBox(width: 4),
                  const Icon(LucideIcons.arrowRight, size: OmIcon.inline, color: OmColors.textMuted),
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

/// Pure-CSS confetti: 30 deterministic pieces falling with 720deg spin.
class _ConfettiLayer extends StatelessWidget {
  const _ConfettiLayer({required this.controller});
  final AnimationController controller;

  @override
  Widget build(BuildContext context) {
    const colors = [Color(0xFFFFCC00), Color(0xFFFF2A2A), Color(0xFF00F3FF), Color(0xFF00FF66), Color(0xFFFFFFFF)];
    return IgnorePointer(
      child: LayoutBuilder(
        builder: (context, box) => AnimatedBuilder(
          animation: controller,
          builder: (context, _) {
            final elapsed = controller.value * 4;
            return Stack(
              children: [
                for (var i = 1; i <= 30; i++)
                  () {
                    final seed = i * 37;
                    final delay = (seed % 1000) / 1000;
                    final dur = 2.2 + (seed % 800) / 1000;
                    final t = ((elapsed - delay) / dur).clamp(0.0, 1.0);
                    if (t <= 0 || t >= 1) return const SizedBox.shrink();
                    final opacity = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
                    return Positioned(
                      left: box.maxWidth * (seed % 100) / 100,
                      top: -10 + box.maxHeight * 1.1 * t,
                      child: Opacity(
                        opacity: opacity.clamp(0.0, 1.0),
                        child: Transform.rotate(
                          angle: 4 * math.pi * t,
                          child: Container(width: 8, height: 14, color: colors[i % colors.length]),
                        ),
                      ),
                    );
                  }(),
              ],
            );
          },
        ),
      ),
    );
  }
}
