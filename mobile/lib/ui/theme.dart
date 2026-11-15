// Design tokens mirrored 1:1 from frontend/src/style.css (@theme block).
// rem values are converted at the browser default of 16px.

import 'dart:math' as math;

import 'package:flutter/material.dart';

abstract final class OmColors {
  static const bgConcrete = Color(0xFF0A0A0B);
  static const bgConcreteLight = Color(0xFF18191B);
  static const surfaceMetal = Color(0xFF1F2226);
  static const surfaceMetalDark = Color(0xFF121416);

  static const hazard = Color(0xFFFFCC00);
  static const hazardDim = Color(0xFF997A00);
  static const alert = Color(0xFFFF2A2A);
  static const alertDim = Color(0xFF801515);
  static const neonBlue = Color(0xFF00F3FF);
  static const neonGreen = Color(0xFF00FF66);
  static const neonMagenta = Color(0xFFFF66DD);

  static const textPrimary = Color(0xFFE6E6E6);
  static const textSecondary = Color(0xFFA1A1AA);
  static const textMuted = Color(0xFF52525B);
}

/// --spacing-*. The scale has no 5, 7, 9-11.
abstract final class OmSpace {
  static const s0 = 0.0;
  static const s1 = 4.0;
  static const s2 = 8.0;
  static const s3 = 12.0;
  static const s4 = 16.0;
  static const s6 = 24.0;
  static const s8 = 32.0;
  static const s12 = 48.0;
  static const s16 = 64.0;
  static const s24 = 96.0;
}

/// --text-*
abstract final class OmText {
  static const xs = 12.0;
  static const sm = 14.0;
  static const base = 16.0;
  static const lg = 18.0;
  static const xl = 20.0;
  static const x2l = 24.0;
  static const x3l = 32.0;
  static const display = 48.0;
  static const hero = 80.0;
}

/// --radius-*
abstract final class OmRadius {
  static const sm = 4.0;
  static const md = 8.0;
  static const lg = 12.0;
  static const pill = 9999.0;
}

/// --duration-* / --ease-*
abstract final class OmMotion {
  static const snap = Duration(milliseconds: 180);
  static const soft = Duration(milliseconds: 320);
  static const bounce = Duration(milliseconds: 500);
  static const strut = Duration(milliseconds: 800);
  static const easeSnap = Cubic(0.33, 1, 0.68, 1);
  static const easeSoft = Cubic(0.65, 0, 0.35, 1);
  static const easeBounce = Cubic(0.34, 1.56, 0.64, 1);
  static const easeStrut = Cubic(0.16, 1, 0.3, 1);
}

/// The repo's fixed Lucide scale (CLAUDE.md).
abstract final class OmIcon {
  static const inline = 14.0;
  static const button = 16.0;
  static const iconButton = 20.0;
  static const display = 40.0;
}

/// --font-display / --font-body. --font-mono is the platform UI font
/// ('Helvetica Neue', 'Segoe UI', Roboto), which is the Flutter default.
const fontDisplay = 'BlackOpsOne';
const fontBody = 'ChakraPetch';
const String? fontMono = null;

/// CSS letter-spacing in em -> logical px for a font size.
double em(double value, double fontSize) => value * fontSize;

TextStyle displayText(double size, {Color color = OmColors.textPrimary, double ls = 0, double? height}) =>
    TextStyle(fontFamily: fontDisplay, fontSize: size, color: color, letterSpacing: em(ls, size), height: height);

TextStyle bodyText(double size,
        {Color color = OmColors.textPrimary, double ls = 0, FontWeight? weight, double? height}) =>
    TextStyle(
        fontFamily: fontBody, fontSize: size, color: color, letterSpacing: em(ls, size), fontWeight: weight, height: height);

TextStyle monoText(double size,
        {Color color = OmColors.textPrimary, double ls = 0, FontWeight? weight, double? height}) =>
    TextStyle(fontFamily: fontMono, fontSize: size, color: color, letterSpacing: em(ls, size), fontWeight: weight, height: height);

ThemeData buildTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    fontFamily: fontBody,
    scaffoldBackgroundColor: OmColors.bgConcrete,
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
    colorScheme: const ColorScheme.dark(
      primary: OmColors.hazard,
      onPrimary: Color(0xFF111111),
      secondary: OmColors.neonBlue,
      error: OmColors.alert,
      surface: OmColors.bgConcrete,
      onSurface: OmColors.textPrimary,
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: OmColors.textPrimary,
      displayColor: OmColors.textPrimary,
      fontFamily: fontBody,
    ),
  );
}

/// CSS radial-gradient sizing for RadialGradient(radius: 0.5) centred in the
/// box. Flutter sizes a radial gradient as a circle on the shortest side; CSS
/// `ellipse` (farthest-corner) stretches to the box's aspect and reaches the
/// corners, and `circle` (farthest-corner) reaches the corners on both axes.
/// On a tall phone the difference is large - an un-stretched circle reaches
/// its last stop far too early top and bottom.
class CssRadial extends GradientTransform {
  const CssRadial.ellipse() : circle = false;
  const CssRadial.circle() : circle = true;

  final bool circle;

  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) {
    final w = bounds.width, h = bounds.height;
    final base = 0.5 * (w < h ? w : h);
    if (base == 0) return Matrix4.identity();
    double sx, sy;
    if (circle) {
      final r = 0.5 * math.sqrt(w * w + h * h);
      sx = sy = r / base;
    } else {
      sx = (w / 2 * math.sqrt2) / base;
      sy = (h / 2 * math.sqrt2) / base;
    }
    final c = bounds.center;
    return Matrix4.translationValues(c.dx, c.dy, 0) *
        Matrix4.diagonal3Values(sx, sy, 1) *
        Matrix4.translationValues(-c.dx, -c.dy, 0);
  }
}
