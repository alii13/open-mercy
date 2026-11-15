// ui/Button.vue - primary (red gradient), secondary (cyan outline),
// ghost (muted outline), danger (solid red).

import 'package:flutter/material.dart';

import '../theme.dart';

enum OmButtonVariant { primary, secondary, ghost, danger }

enum OmButtonSize { sm, md, lg }

class OmButton extends StatefulWidget {
  const OmButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = OmButtonVariant.primary,
    this.size = OmButtonSize.md,
    this.block = false,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final OmButtonVariant variant;
  final OmButtonSize size;
  final bool block;
  final Widget? icon;

  @override
  State<OmButton> createState() => _OmButtonState();
}

class _OmButtonState extends State<OmButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final disabled = widget.onPressed == null;
    final (pad, font, minH) = switch (widget.size) {
      OmButtonSize.sm => (const EdgeInsets.symmetric(horizontal: OmSpace.s4, vertical: OmSpace.s2), OmText.sm, 44.0),
      OmButtonSize.md => (const EdgeInsets.symmetric(horizontal: OmSpace.s6, vertical: OmSpace.s3), OmText.base, 44.0),
      OmButtonSize.lg => (const EdgeInsets.symmetric(horizontal: OmSpace.s8, vertical: OmSpace.s4), OmText.lg, 56.0),
    };
    final (Gradient? gradient, Color? fill, Color border, Color fg) = switch (widget.variant) {
      OmButtonVariant.primary => (
          const LinearGradient(
            begin: Alignment(-0.6, -1),
            end: Alignment(0.6, 1),
            colors: [OmColors.alert, OmColors.alertDim],
          ),
          null,
          OmColors.alert,
          Colors.white,
        ),
      OmButtonVariant.secondary => (null, null, OmColors.neonBlue, OmColors.neonBlue),
      OmButtonVariant.ghost => (null, null, OmColors.textMuted, OmColors.textSecondary),
      OmButtonVariant.danger => (null, OmColors.alert, OmColors.alert, Colors.white),
    };

    final content = Row(
      mainAxisSize: widget.block ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (widget.icon != null) ...[widget.icon!, const SizedBox(width: OmSpace.s2)],
        Text(widget.label.toUpperCase(), style: displayText(font, color: fg, ls: 0.1), maxLines: 1),
      ],
    );

    return Opacity(
      opacity: disabled ? 0.4 : 1,
      child: GestureDetector(
        onTapDown: disabled ? null : (_) => setState(() => _down = true),
        onTapUp: disabled ? null : (_) => setState(() => _down = false),
        onTapCancel: disabled ? null : () => setState(() => _down = false),
        onTap: widget.onPressed,
        child: AnimatedContainer(
          duration: OmMotion.snap,
          curve: OmMotion.easeSnap,
          width: widget.block ? double.infinity : null,
          constraints: BoxConstraints(minHeight: minH),
          padding: pad,
          transform: Matrix4.translationValues(0, _down ? 0 : 0, 0),
          decoration: BoxDecoration(
            gradient: gradient,
            color: fill,
            border: Border.all(color: border, width: 2),
            borderRadius: BorderRadius.circular(OmRadius.sm),
          ),
          child: Center(widthFactor: widget.block ? null : 1, child: content),
        ),
      ),
    );
  }
}
