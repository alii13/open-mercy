// Port of frontend/src/utils/__tests__/handLayout.spec.ts.

import 'package:app/game/hand_layout.dart';
import 'package:flutter_test/flutter_test.dart';

const band = 186.0;
const vw = 390.0;

void main() {
  test('fans a small hand that fits, with slivers above the floor', () {
    final r = computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 7, pointerCoarse: true);
    expect(r.mode, HandMode.fan);
    expect(r.cardW, 74);
    expect(r.cardH, (74 * 1.4).roundToDouble());
    expect(r.step, greaterThanOrEqualTo(44));
    expect(r.step, closeTo(49, 0.5));
    expect(r.slots.length, 7);
  });

  test('switches to scroll once a dense hand can no longer meet the sliver floor', () {
    expect(computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 15, pointerCoarse: true).mode, HandMode.scroll);
    final r24 = computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 24, pointerCoarse: true);
    expect(r24.mode, HandMode.scroll);
    expect(r24.cardW, 53);
    expect(r24.step, 44);
    expect(r24.slots.last.x + r24.cardW, 1065);
  });

  test('honours the coarse-pointer sliver floor (44) vs fine (24)', () {
    expect(computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 10, pointerCoarse: true).mode, HandMode.scroll);
    expect(computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 10, pointerCoarse: false).mode, HandMode.fan);
  });

  test('locks scroll step to 44 for both pointer types', () {
    expect(computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 24, pointerCoarse: true).step, 44);
    expect(computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 24, pointerCoarse: false).step, 44);
  });

  test('flattens rotation and arc in scroll mode', () {
    final r = computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 24, pointerCoarse: true);
    for (final s in r.slots) {
      expect(s.rotate, 0);
      expect(s.arcY, 0);
    }
  });

  test('arcs a fanned hand (center flat, edges lifted and rotated)', () {
    final r = computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 7, pointerCoarse: true);
    expect(r.slots[3].rotate, closeTo(0, 1e-5));
    expect(r.slots[3].arcY, closeTo(0, 1e-5));
    expect(r.slots[0].arcY, greaterThan(0));
    expect(r.slots[0].rotate, lessThan(0));
    expect(r.slots[6].rotate, greaterThan(0));
  });

  test('handles a single card without NaN', () {
    final r = computeHandLayout(viewportWidth: vw, bandHeight: band, handSize: 1, pointerCoarse: true);
    expect(r.mode, HandMode.fan);
    expect(r.slots.single.x, 0);
    expect(r.step.isNaN, false);
  });

  test('caps card size to the band height', () {
    final r = computeHandLayout(viewportWidth: vw, bandHeight: 100, handSize: 7, pointerCoarse: true);
    expect(r.cardW, 62);
    expect(r.cardH, (62 * 1.4).roundToDouble());
  });

  test('clamps fluid card width between 58 and 100', () {
    expect(computeHandLayout(viewportWidth: 200, bandHeight: 400, handSize: 3, pointerCoarse: true).cardW, 58);
    expect(computeHandLayout(viewportWidth: 2000, bandHeight: 400, handSize: 3, pointerCoarse: false).cardW, 100);
  });
}
