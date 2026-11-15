// RulesModal.vue - "HOW TO PLAY", copy verbatim.

import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../services/settings_store.dart';
import '../theme.dart';

Future<void> showRulesModal(BuildContext context) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Close',
    barrierColor: Colors.transparent,
    transitionDuration: motionReduced ? Duration.zero : OmMotion.soft,
    transitionBuilder: (context, a, b, child) =>
        FadeTransition(opacity: CurvedAnimation(parent: a, curve: OmMotion.easeSoft), child: child),
    pageBuilder: (context, a, b) => const _RulesOverlay(),
  );
}

class _RulesOverlay extends StatelessWidget {
  const _RulesOverlay();

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.of(context).pop(),
        child: ColoredBox(
          color: const Color(0xD9000000),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(OmSpace.s2),
              child: GestureDetector(
                onTap: () {},
                child: Material(
                  type: MaterialType.transparency,
                  child: Container(
                    width: (size.width * 0.94).clamp(0, 540),
                    constraints: BoxConstraints(maxHeight: size.height * 0.88),
                    decoration: BoxDecoration(
                      color: const Color(0xFF111111),
                      border: Border.all(color: OmColors.hazard, width: 2),
                      borderRadius: BorderRadius.circular(4),
                      boxShadow: const [
                        BoxShadow(color: Color(0x99000000), offset: Offset(0, 24), blurRadius: 70),
                        BoxShadow(color: Color(0x1FFFCC00), blurRadius: 50),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _header(context),
                        const Flexible(child: _RulesBody()),
                        _footer(context),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x38FFCC00))),
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x0FFFCC00), Color(0x00FFCC00)],
          ),
        ),
        child: Row(
          children: [
            Expanded(child: Text('HOW TO PLAY', style: displayText(19.2, color: OmColors.hazard, ls: 0.14))),
            GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0x1FFFFFFF)),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Icon(LucideIcons.x, size: OmIcon.button, color: OmColors.textSecondary),
              ),
            ),
          ],
        ),
      );

  Widget _footer(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(20, 13.6, 20, 16),
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Color(0x14FFFFFF)))),
        child: GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Container(
            padding: const EdgeInsets.all(11.2),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: OmColors.hazard, borderRadius: BorderRadius.circular(3)),
            child: Text('GOT IT', style: displayText(15.2, color: const Color(0xFF111111), ls: 0.12)),
          ),
        ),
      );
}

class _RulesBody extends StatelessWidget {
  const _RulesBody();

  @override
  Widget build(BuildContext context) {
    final strong = bodyText(13.8, color: OmColors.textPrimary, weight: FontWeight.bold);
    final body = bodyText(13.8, color: OmColors.textSecondary, height: 1.45);
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 17.6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text.rich(
            TextSpan(
              style: bodyText(14.7, color: OmColors.textSecondary, height: 1.55),
              children: [
                const TextSpan(text: 'Be the first to empty your hand. Open Mercy is brutal — penalties stack high and if you ever hold '),
                TextSpan(text: '25 cards', style: bodyText(14.7, color: OmColors.alert, weight: FontWeight.bold)),
                const TextSpan(text: ", you're "),
                TextSpan(text: 'eliminated', style: bodyText(14.7, color: OmColors.alert, weight: FontWeight.bold)),
                const TextSpan(text: '.'),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _subhead('BASICS'),
          _bullet([
            const TextSpan(text: 'Play a card that matches the '),
            TextSpan(text: 'color', style: strong),
            const TextSpan(text: ' or the '),
            TextSpan(text: 'number/symbol', style: strong),
            const TextSpan(text: ' on the pile.'),
          ], body),
          _bullet([
            const TextSpan(text: "Can't play? "),
            TextSpan(text: 'Draw', style: strong),
            const TextSpan(text: ' from the deck. If the drawn card is playable it plays automatically.'),
          ], body),
          _bullet([
            const TextSpan(text: 'Down to one card? '),
            TextSpan(text: 'Call MERCY!', style: strong),
            const TextSpan(text: ' — forget and you\'re penalized.'),
          ], body),
          const SizedBox(height: 20),
          _subhead('THE NO MERCY CARDS'),
          _card('+2 +4', _Chip.num, [TextSpan(text: 'Draw cards.', style: strong), const TextSpan(text: ' Stack them on the next player — they draw the whole pile or stack their own to pass it on.')]),
          _card('+6 +10', _Chip.danger, [TextSpan(text: 'Wild draws.', style: strong), const TextSpan(text: ' Massive penalties that send a hand spiralling toward the 25-card mercy limit.')]),
          _card('SKIP', _Chip.plain, const [TextSpan(text: "Skip the next player's turn.")]),
          _card('REV', _Chip.plain, const [TextSpan(text: 'Reverse the direction of play.')]),
          _card('SKIP ALL', _Chip.plain, [TextSpan(text: 'Skip everyone', style: strong), const TextSpan(text: ' — you immediately play again.')]),
          _card('DISCARD ALL', _Chip.plain, [const TextSpan(text: 'Dump '), TextSpan(text: 'every card of that color', style: strong), const TextSpan(text: ' from your hand at once.')]),
          _card('7', _Chip.num, [TextSpan(text: 'Swap hands', style: strong), const TextSpan(text: ' with any player you choose.')]),
          _card('0', _Chip.num, [TextSpan(text: 'Everyone passes', style: strong), const TextSpan(text: ' their whole hand in the direction of play.')]),
          _card('ROULETTE', _Chip.wild, [TextSpan(text: 'Wild Color Roulette.', style: strong), const TextSpan(text: ' The victim calls a color, then draws until they hit it. Could be one card — could be ten.')]),
          _card('WILD +4 REV', _Chip.wild, [const TextSpan(text: 'Reverse direction '), TextSpan(text: 'and', style: body.copyWith(fontStyle: FontStyle.italic)), const TextSpan(text: ' hit the next player with +4.')]),
          const SizedBox(height: 20),
          _subhead('STACKING RULES'),
          _bullet([TextSpan(text: 'Official', style: strong), const TextSpan(text: ' — stack a draw card only on an equal or higher value.')], body),
          _bullet([TextSpan(text: 'House', style: strong), const TextSpan(text: ' — wild draws (+4/+6/+10) stack on anything; colored draws stay strict.')], body),
          _bullet([TextSpan(text: 'Casual', style: strong), const TextSpan(text: ' — anything goes, any draw stacks on any draw.')], body),
        ],
      ),
    );
  }

  Widget _subhead(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 9.6),
        child: Text(t, style: monoText(10.9, color: OmColors.neonBlue, ls: 0.24)),
      );

  Widget _bullet(List<InlineSpan> spans, TextStyle style) => Padding(
        padding: const EdgeInsets.only(bottom: 7.2, left: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('•  ', style: style),
            Expanded(child: Text.rich(TextSpan(style: style, children: spans))),
          ],
        ),
      );

  Widget _card(String chip, _Chip kind, List<InlineSpan> spans) {
    final (Gradient? grad, Color? bg, Color border, Color fg) = switch (kind) {
      _Chip.plain => (null, const Color(0x12FFFFFF), const Color(0x24FFFFFF), OmColors.textPrimary),
      _Chip.num => (null, const Color(0x2E2AD4FF), const Color(0x662AD4FF), OmColors.textPrimary),
      _Chip.danger => (null, const Color(0x2EFF2A2A), const Color(0x73FF2A2A), OmColors.alert),
      _Chip.wild => (
          const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0x40FF2A2A), Color(0x402AD4FF)],
          ),
          null,
          const Color(0x66FFCC00),
          OmColors.textPrimary,
        ),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8.8),
      child: Row(
        children: [
          Container(
            width: 74,
            constraints: const BoxConstraints(minHeight: 26),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 5),
            decoration: BoxDecoration(
              color: bg,
              gradient: grad,
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(chip, textAlign: TextAlign.center, style: displayText(9.6, color: fg, ls: 0.05)),
          ),
          const SizedBox(width: 10.4),
          Expanded(
            child: Text.rich(
              TextSpan(style: bodyText(13.4, color: OmColors.textSecondary, height: 1.4), children: spans),
            ),
          ),
        ],
      ),
    );
  }
}

enum _Chip { plain, num, danger, wild }
