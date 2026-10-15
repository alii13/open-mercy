// ColorPickerModal.vue, PlayerSelectModal.vue, DiscardAllPickerModal.vue,
// ConfirmDialog.vue and the ui/Modal.vue bottom-sheet shell (<=768px).

import 'dart:ui';

import 'package:flutter/material.dart' hide Card;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../engine/types.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/card_view.dart';
import '../widgets/om_button.dart';

/// The forced colour pick: a scrim over everything above the hand band with
/// the tactical panel docked at its bottom, so the fan stays visible.
class ColorPickerPanel extends StatefulWidget {
  const ColorPickerPanel({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onSelect,
    this.isRoulette = false,
    this.card,
    this.colorCounts,
  });

  final String title;
  final String subtitle;
  final bool isRoulette;
  final Card? card;
  final Map<CardColor, int>? colorCounts;
  final ValueChanged<CardColor> onSelect;

  @override
  State<ColorPickerPanel> createState() => _ColorPickerPanelState();
}

class _ColorPickerPanelState extends State<ColorPickerPanel> with TickerProviderStateMixin {
  late final AnimationController _enter = AnimationController(vsync: this, duration: OmMotion.soft);
  late final AnimationController _blink = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
  late final AnimationController _iconBlink = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));

  @override
  void initState() {
    super.initState();
    if (motionReduced) {
      _enter.value = 1;
    } else {
      _enter.forward();
      _iconBlink.repeat(reverse: true);
      if (widget.isRoulette) _blink.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _enter.dispose();
    _blink.dispose();
    _iconBlink.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final headerColor = widget.isRoulette ? const Color(0xFFFF3333) : OmColors.hazard;
    final enter = CurvedAnimation(parent: _enter, curve: OmMotion.easeSoft);
    return FadeTransition(
      opacity: enter,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {},
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Color(0x59000000), Color(0xBF04060A)],
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          alignment: Alignment.bottomCenter,
          child: AnimatedBuilder(
            animation: enter,
            builder: (context, child) => Transform.translate(offset: Offset(0, 16 * (1 - enter.value)), child: child),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              // role="dialog" aria-modal: scopesRoute needs explicitChildNodes.
              child: Semantics(
                scopesRoute: true,
                namesRoute: true,
                explicitChildNodes: true,
                label: widget.title,
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0xF50D0E10),
                    border: Border.all(color: OmColors.hazard, width: 2),
                    boxShadow: const [BoxShadow(color: Color(0x2EFFCC00), blurRadius: 40)],
                  ),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      // Cutout on the top border (20%..80%).
                      Positioned(
                        top: -2,
                        left: 0,
                        right: 0,
                        child: FractionallySizedBox(
                          widthFactor: 0.6,
                          child: Container(height: 2, color: const Color(0xF50D0E10)),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            AnimatedBuilder(
                              animation: _blink,
                              builder: (context, child) => Container(
                                color: widget.isRoulette
                                    ? Color.fromRGBO(255, 0, 0, 0.2 * Curves.easeInOut.transform(_blink.value))
                                    : null,
                                child: child,
                              ),
                              child: Container(
                                padding: const EdgeInsets.only(bottom: 8),
                                margin: const EdgeInsets.only(bottom: 8),
                                decoration: BoxDecoration(
                                  border: Border(bottom: BorderSide(color: widget.isRoulette ? const Color(0xFFFF3333) : OmColors.hazardDim)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    FadeTransition(
                                      opacity: Tween(begin: 1.0, end: 0.5).animate(_iconBlink),
                                      child: Icon(LucideIcons.triangleAlert, size: OmIcon.button, color: headerColor),
                                    ),
                                    const SizedBox(width: 8),
                                    Flexible(
                                      child: Text(
                                        widget.title,
                                        textAlign: TextAlign.center,
                                        style: monoText(12, color: headerColor, weight: FontWeight.bold).copyWith(letterSpacing: 2),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 9.6),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  if (widget.card != null) ...[
                                    CardFace(card: widget.card!, width: 44, height: 62),
                                    const SizedBox(width: 12),
                                  ],
                                  Flexible(
                                    child: Text(
                                      widget.subtitle,
                                      textAlign: TextAlign.center,
                                      style: displayText(16, color: Colors.white).copyWith(letterSpacing: 2),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Row(
                              children: [
                                for (final (i, c) in pickableColors.indexed) ...[
                                  if (i > 0) const SizedBox(width: 8),
                                  Expanded(
                                    child: _ColorButton(
                                      color: c,
                                      count: widget.colorCounts?[c],
                                      onTap: () => widget.onSelect(c),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ColorButton extends StatelessWidget {
  const _ColorButton({required this.color, required this.count, required this.onTap});

  final CardColor color;
  final int? count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final (a, b) = switch (color) {
      CardColor.red => (const Color(0xFFCC0000), const Color(0xFF990000)),
      CardColor.blue => (const Color(0xFF0066CC), const Color(0xFF004499)),
      CardColor.green => (const Color(0xFF00CC66), const Color(0xFF009944)),
      _ => (const Color(0xFFFFCC00), const Color(0xFFCC9900)),
    };
    final yellow = color == CardColor.yellow;
    final fg = yellow ? Colors.black : Colors.white;
    final shadow = yellow ? null : const [Shadow(color: Color(0x80000000), offset: Offset(0, 2), blurRadius: 4)];
    return GestureDetector(
      onTap: onTap,
      child: ClipPath(
        clipper: const _Chamfer(),
        child: Container(
          height: 64,
          color: const Color(0xFF222222),
          padding: const EdgeInsets.all(3),
          child: ClipPath(
            clipper: const _Chamfer(),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [a, b]),
              ),
              alignment: Alignment.center,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // line-height: 1.5 (inherited from body), as in the CSS.
                  Text(color.name.toUpperCase(), style: displayText(14.4, color: fg, height: 1.5).copyWith(shadows: shadow)),
                  if (count != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 1),
                      child: Opacity(
                        opacity: 0.9,
                        child: Text('×$count', style: monoText(12.8, color: fg, weight: FontWeight.bold, height: 1.5).copyWith(shadows: shadow)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)
class _Chamfer extends CustomClipper<Path> {
  const _Chamfer();
  @override
  Path getClip(Size s) => Path()
    ..moveTo(8, 0)
    ..lineTo(s.width, 0)
    ..lineTo(s.width, s.height - 8)
    ..lineTo(s.width - 8, s.height)
    ..lineTo(0, s.height)
    ..lineTo(0, 8)
    ..close();
  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// ui/Modal.vue in sheet mode on phones: blurred dark overlay, the content
/// docked to the bottom with a grabber, sliding up.
Future<T?> showSheetModal<T>(BuildContext context, {required WidgetBuilder builder, bool dismissible = false}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: dismissible,
    barrierLabel: 'Dismiss',
    barrierColor: Colors.transparent,
    transitionDuration: motionReduced ? Duration.zero : OmMotion.soft,
    pageBuilder: (context, a, b) => PopScope(canPop: dismissible, child: _SheetShell(child: builder(context))),
    transitionBuilder: (context, a, b, child) {
      final curved = CurvedAnimation(parent: a, curve: OmMotion.easeSoft);
      return FadeTransition(opacity: curved, child: child);
    },
  );
}

class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final route = ModalRoute.of(context);
    final anim = route?.animation ?? const AlwaysStoppedAnimation(1.0);
    final pad = MediaQuery.paddingOf(context);
    final size = MediaQuery.sizeOf(context);
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: ColoredBox(
        color: const Color(0xD9000000),
        child: Align(
          alignment: Alignment.bottomCenter,
          child: AnimatedBuilder(
            animation: anim,
            builder: (context, c) => FractionalTranslation(
              translation: Offset(0, 1 - OmMotion.easeSoft.transform(anim.value)),
              child: c,
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
              child: ConstrainedBox(
                constraints: BoxConstraints(maxHeight: size.height * 0.85),
                child: SingleChildScrollView(
                  padding: EdgeInsets.only(bottom: pad.bottom > OmSpace.s4 ? pad.bottom : OmSpace.s4),
                  child: Material(
                    type: MaterialType.transparency,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(
                          child: Container(
                            width: 40,
                            height: 4,
                            margin: const EdgeInsets.fromLTRB(0, 8, 0, 4),
                            decoration: BoxDecoration(color: const Color(0x4DFFFFFF), borderRadius: BorderRadius.circular(2)),
                          ),
                        ),
                        child,
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
}

BoxDecoration _pickerCard(Color border) => BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFF18191B), Color(0xFF0A0A0B)],
      ),
      border: Border.all(color: border),
      borderRadius: BorderRadius.circular(OmRadius.md),
    );

/// PlayerSelectModal.vue - returns a player id, or null for KEEP MY HAND.
Future<String?> showPlayerSelect(BuildContext context, List<Player> eligible) {
  return showSheetModal<String?>(
    context,
    builder: (context) => Container(
      decoration: _pickerCard(const Color(0x33FFCC00)).copyWith(
        boxShadow: const [BoxShadow(color: Color(0x1AFFCC00), blurRadius: 40)],
      ),
      padding: const EdgeInsets.all(OmSpace.s4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            const Icon(LucideIcons.shuffle, size: OmIcon.iconButton, color: OmColors.hazard),
            const SizedBox(width: OmSpace.s3),
            Text('SWAP HANDS', style: displayText(OmText.lg, color: OmColors.hazard, ls: 0.15)),
          ]),
          const SizedBox(height: OmSpace.s4),
          Text('Pick a player to swap your hand with.', style: bodyText(OmText.sm, color: OmColors.textSecondary)),
          const SizedBox(height: OmSpace.s4),
          for (final p in eligible) ...[
            GestureDetector(
              onTap: () => Navigator.of(context).pop(p.id),
              child: Container(
                constraints: const BoxConstraints(minHeight: 44),
                padding: const EdgeInsets.symmetric(horizontal: OmSpace.s4, vertical: OmSpace.s3),
                decoration: BoxDecoration(
                  color: const Color(0x4D000000),
                  border: Border.all(color: const Color(0x14FFFFFF)),
                  borderRadius: BorderRadius.circular(OmRadius.sm),
                ),
                child: Row(children: [
                  Expanded(child: Text(p.name, style: bodyText(OmText.base, weight: FontWeight.bold))),
                  Text('${p.hand.length} cards', style: monoText(OmText.xs, color: OmColors.textMuted, ls: 0.1)),
                ]),
              ),
            ),
            const SizedBox(height: OmSpace.s2),
          ],
          const SizedBox(height: OmSpace.s2),
          OmButton(
            label: 'KEEP MY HAND',
            variant: OmButtonVariant.ghost,
            block: true,
            onPressed: () => Navigator.of(context).pop(null),
          ),
        ],
      ),
    ),
  );
}

/// DiscardAllPickerModal.vue - returns the chosen top card id.
Future<String?> showDiscardAllPicker(BuildContext context, List<Card> cards) {
  return showSheetModal<String>(
    context,
    builder: (context) => Container(
      decoration: _pickerCard(const Color(0x40FFCC00)).copyWith(
        boxShadow: const [BoxShadow(color: Color(0x1FFFCC00), blurRadius: 50)],
      ),
      padding: const EdgeInsets.all(OmSpace.s4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(children: [
            const Icon(LucideIcons.triangleAlert, size: OmIcon.iconButton, color: OmColors.hazard),
            const SizedBox(width: OmSpace.s3),
            Text('PICK TOP CARD', style: displayText(OmText.base, color: OmColors.hazard, ls: 0.15)),
          ]),
          const SizedBox(height: OmSpace.s4),
          Text(
            'All cards discard at once. The one you pick determines what your opponent can play next.',
            style: bodyText(OmText.xs, color: OmColors.textSecondary, height: 1.5),
          ),
          const SizedBox(height: OmSpace.s4),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: OmSpace.s2),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: OmSpace.s3,
              runSpacing: OmSpace.s3,
              children: [
                for (final c in cards)
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(c.id),
                    child: Semantics(
                      button: true,
                      label: 'Pick ${c.color.name} ${c.type.name}',
                      child: CardFace(card: c, width: 76, height: 106, isPlayable: true),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

/// ConfirmDialog.vue - true on confirm.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'CONFIRM',
  String cancelLabel = 'CANCEL',
}) async {
  final r = await showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Cancel',
    barrierColor: Colors.transparent,
    transitionDuration: motionReduced ? Duration.zero : OmMotion.soft,
    transitionBuilder: (context, a, b, child) =>
        FadeTransition(opacity: CurvedAnimation(parent: a, curve: OmMotion.easeSoft), child: child),
    pageBuilder: (context, a, b) => BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 6, sigmaY: 6),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => Navigator.of(context).pop(false),
        child: ColoredBox(
          color: const Color(0xD9000000),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(OmSpace.s4),
              child: GestureDetector(
                onTap: () {},
                child: Material(
                  type: MaterialType.transparency,
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 380),
                    padding: const EdgeInsets.symmetric(horizontal: OmSpace.s6, vertical: OmSpace.s8),
                    decoration: _pickerCard(const Color(0x59FF2A2A)).copyWith(
                      boxShadow: const [BoxShadow(color: Color(0x2EFF2A2A), blurRadius: 40)],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title.toUpperCase(),
                            textAlign: TextAlign.center, style: displayText(OmText.xl, ls: 0.12)),
                        const SizedBox(height: OmSpace.s3),
                        Text(message,
                            textAlign: TextAlign.center,
                            style: bodyText(OmText.sm, color: OmColors.textSecondary, height: 1.5)),
                        const SizedBox(height: OmSpace.s6),
                        Row(children: [
                          Expanded(
                            child: _ConfirmBtn(
                              label: cancelLabel,
                              border: const Color(0x2EFFFFFF),
                              fg: OmColors.textSecondary,
                              onTap: () => Navigator.of(context).pop(false),
                            ),
                          ),
                          const SizedBox(width: OmSpace.s3),
                          Expanded(
                            child: _ConfirmBtn(
                              label: confirmLabel,
                              border: OmColors.alert,
                              fg: OmColors.alert,
                              bg: const Color(0x0FFF2A2A),
                              onTap: () => Navigator.of(context).pop(true),
                            ),
                          ),
                        ]),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  return r ?? false;
}

class _ConfirmBtn extends StatelessWidget {
  const _ConfirmBtn({required this.label, required this.border, required this.fg, required this.onTap, this.bg});
  final String label;
  final Color border;
  final Color fg;
  final Color? bg;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.all(OmSpace.s3),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(OmRadius.sm),
          ),
          child: Text(label.toUpperCase(), style: displayText(OmText.sm, color: fg, ls: 0.15)),
        ),
      );
}
