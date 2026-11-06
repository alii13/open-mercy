// Port of frontend/src/utils/handLayout.ts - the pure fan/scroll solver.

import 'dart:math' as math;

class HandSlot {
  const HandSlot({required this.x, required this.rotate, required this.arcY, required this.zIndex});
  final double x;
  final double rotate;
  final double arcY;
  final int zIndex;
}

enum HandMode { fan, scroll }

class HandLayout {
  const HandLayout({required this.cardW, required this.cardH, required this.step, required this.mode, required this.slots});
  final double cardW;
  final double cardH;
  final double step;
  final HandMode mode;
  final List<HandSlot> slots;
}

const _cardAspect = 1.4;
const _wMin = 58.0;
const _wMax = 100.0;
const _wPerVw = 0.19;
const _edgePad = 12.0;
const _comfortRatio = 0.66;
const _scrollStep = 44.0;
const _bandPad = 12.0;

double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

double _cardWidthFor(double viewportWidth, double bandHeight, int handSize) {
  final fluid = _clamp(viewportWidth * _wPerVw, _wMin, _wMax);
  final density = handSize <= 8 ? 1.0 : math.max(0.72, 1 - (handSize - 8) * 0.03);
  final byWidth = fluid * density;
  final byBand = ((bandHeight - _bandPad) / _cardAspect).floorToDouble();
  return math.min(byWidth, byBand).floorToDouble();
}

HandLayout computeHandLayout({
  required double viewportWidth,
  required double bandHeight,
  required int handSize,
  required bool pointerCoarse,
}) {
  final n = math.max(0, handSize);
  final cardW = _cardWidthFor(viewportWidth, bandHeight, handSize);
  final cardH = (cardW * _cardAspect).roundToDouble();

  if (n <= 1) {
    return HandLayout(
      cardW: cardW,
      cardH: cardH,
      step: 0,
      mode: HandMode.fan,
      slots: n == 1 ? const [HandSlot(x: 0, rotate: 0, arcY: 0, zIndex: 0)] : const [],
    );
  }

  final sliverMin = pointerCoarse ? 44.0 : 24.0;
  final available = viewportWidth - _edgePad * 2;
  final stepToFit = (available - cardW) / (n - 1);
  final mode = stepToFit >= sliverMin ? HandMode.fan : HandMode.scroll;
  final step = mode == HandMode.fan ? math.min(stepToFit, cardW * _comfortRatio) : _scrollStep;

  final mid = (n - 1) / 2;
  final rotatePerStep = mode == HandMode.fan ? _clamp(n * 1.2, 6, 24) / (n - 1) : 0.0;

  return HandLayout(
    cardW: cardW,
    cardH: cardH,
    step: step,
    mode: mode,
    slots: List.generate(n, (i) {
      final fromMid = i - mid;
      return HandSlot(
        x: i * step,
        rotate: mode == HandMode.fan ? fromMid * rotatePerStep : 0,
        arcY: mode == HandMode.fan ? fromMid.abs() * cardW * 0.03 : 0,
        zIndex: i,
      );
    }),
  );
}
