// Port of frontend/src/utils/shareImage.ts (the win card): a 1080x1920 PNG
// drawn with the same coordinates, fonts and colours as the web canvas.

import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';

import '../ui/theme.dart';

class ShareImagePayload {
  const ShareImagePayload({
    required this.isWinner,
    required this.opponentName,
    required this.cardsPlayed,
    required this.biggestStack,
    required this.unosCalled,
    required this.peakHand,
    this.siteUrl = 'open-mercy.com',
  });

  final bool isWinner;
  final String opponentName;
  final int cardsPlayed;
  final int biggestStack;
  final int unosCalled;
  final int peakHand;
  final String siteUrl;
}

const _w = 1080.0;
const _h = 1920.0;

void _text(
  ui.Canvas c,
  String s,
  double x,
  double y,
  TextStyle style, {
  bool bottom = false,
  List<Shadow>? shadows,
}) {
  final tp = TextPainter(
    text: TextSpan(text: s, style: style.copyWith(shadows: shadows, height: 1)),
    textDirection: TextDirection.ltr,
    textAlign: TextAlign.center,
  )..layout();
  tp.paint(c, Offset(x - tp.width / 2, bottom ? y - tp.height : y));
}

void _dangerTape(ui.Canvas c, double x, double y, double w, double h) {
  c.drawRect(Rect.fromLTWH(x, y, w, h), Paint()..color = const Color(0xFFFFCC00));
  final p = Paint()..color = const Color(0xFF0A0A0B);
  const stripeW = 36.0;
  c.save();
  c.clipRect(Rect.fromLTWH(x, y, w, h));
  for (var i = -h; i < w + h; i += stripeW * 2) {
    c.drawPath(
      Path()
        ..moveTo(x + i, y)
        ..lineTo(x + i + stripeW, y)
        ..lineTo(x + i + stripeW + h, y + h)
        ..lineTo(x + i + h, y + h)
        ..close(),
      p,
    );
  }
  c.restore();
}

Future<Uint8List?> generateShareImage(ShareImagePayload p) async {
  final rec = ui.PictureRecorder();
  final c = ui.Canvas(rec, const Rect.fromLTWH(0, 0, _w, _h));

  // Background: radial #18191b -> #0a0a0b, 45deg stripes, danger tape.
  c.drawRect(
    const Rect.fromLTWH(0, 0, _w, _h),
    Paint()
      ..shader = ui.Gradient.radial(
        const Offset(_w / 2, _h / 2),
        _w,
        const [Color(0xFF18191B), Color(0xFF0A0A0B)],
        const [100 / _w, 1],
      ),
  );
  c.save();
  c.translate(_w / 2, _h / 2);
  c.rotate(math.pi / 4);
  final stripe = Paint()..color = const Color(0x2E000000);
  for (var i = -_w; i < _w; i += 8) {
    c.drawRect(Rect.fromLTWH(i, -_h, 2, _h * 2), stripe);
  }
  c.restore();
  _dangerTape(c, 0, 0, _w, 24);
  _dangerTape(c, 0, _h - 24, _w, 24);

  // Title.
  _text(c, 'OPEN', _w / 2, 140, const TextStyle(fontFamily: fontDisplay, fontSize: 240, color: Color(0xFFFF2A2A)),
      shadows: const [Shadow(color: Color(0xB3FF2A2A), blurRadius: 40)]);
  _text(c, 'MERCY', _w / 2, 400, const TextStyle(fontFamily: fontDisplay, fontSize: 96, color: Color(0xFFFFCC00)),
      shadows: const [Shadow(color: Color(0x8CFFCC00), blurRadius: 25)]);

  // Verdict stamp, rotated -0.05rad.
  c.save();
  c.translate(_w / 2, 620);
  c.rotate(-0.05);
  final win = p.isWinner;
  _text(
    c,
    win ? 'VICTORY' : 'DEFEATED',
    0,
    0,
    TextStyle(fontFamily: fontDisplay, fontSize: 180, color: win ? const Color(0xFFFFCC00) : const Color(0xFFFF2A2A)),
    shadows: [Shadow(color: win ? const Color(0x80FFCC00) : const Color(0x80FF2A2A), blurRadius: 35)],
  );
  c.restore();
  _text(
    c,
    win ? 'I broke ${p.opponentName}.' : '${p.opponentName} broke me.',
    _w / 2,
    840,
    const TextStyle(fontFamily: fontBody, fontSize: 32, color: Color(0xFFA1A1AA)),
  );

  // 2x2 stats.
  final cells = [
    ('${p.cardsPlayed}', 'CARDS PLAYED'),
    ('${p.biggestStack}', 'BIGGEST STACK'),
    ('${p.unosCalled}', 'MERCY CALLS'),
    ('${p.peakHand}', 'PEAK HAND'),
  ];
  for (final (i, cell) in cells.indexed) {
    final x = 120 + (i % 2) * (420 + 60.0);
    final y = 1020 + (i ~/ 2) * (220 + 60.0);
    c.drawRect(
      Rect.fromLTWH(x, y, 420, 220),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = const Color(0x2EFFCC00),
    );
    _text(c, cell.$1, x + 210, y + 24,
        TextStyle(fontFamily: fontDisplay, fontSize: 140, color: win ? const Color(0xFFFFCC00) : const Color(0xFFE6E6E6)));
    _text(c, cell.$2, x + 210, y + 220 - 50, const TextStyle(fontFamily: fontBody, fontSize: 24, color: Color(0xFF52525B)));
  }

  // Footer.
  _text(c, 'PLAY FREE', _w / 2, _h - 100, const TextStyle(fontFamily: fontBody, fontSize: 28, color: Color(0xFFA1A1AA)),
      bottom: true);
  _text(c, p.siteUrl, _w / 2, _h - 60,
      const TextStyle(fontFamily: fontBody, fontSize: 34, fontWeight: FontWeight.bold, color: Color(0xFF00F3FF)),
      bottom: true);

  final pic = rec.endRecording();
  final img = await pic.toImage(_w.toInt(), _h.toInt());
  pic.dispose();
  try {
    final data = await img.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  } finally {
    img.dispose();
  }
}
