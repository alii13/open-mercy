// Port of frontend/src/utils/__tests__/peekMachine.spec.ts.

import 'package:app/game/peek_machine.dart';
import 'package:flutter_test/flutter_test.dart';

PeekState pressPending([int index = 2, double x = 100, double y = 200]) =>
    PeekState(PeekPhase.pressPending, index: index, startX: x, startY: y);

void main() {
  test('IDLE: pointerdown arms the press', () {
    final (s, e) = peekReduce(PeekState.idle, const PointerDown(3, 10, 20));
    expect((s.phase, s.index, s.startX, s.startY), (PeekPhase.pressPending, 3, 10.0, 20.0));
    expect(e, isEmpty);
  });

  test('IDLE ignores everything else', () {
    expect(peekReduce(PeekState.idle, const PointerUp()).$1, same(PeekState.idle));
    expect(peekReduce(PeekState.idle, const HoldElapsed()).$1, same(PeekState.idle));
  });

  test('quick release plays the pressed card', () {
    final (s, e) = peekReduce(pressPending(2), const PointerUp());
    expect(s, same(PeekState.idle));
    expect(e.single, isA<TapPlay>().having((t) => t.index, 'index', 2));
  });

  test('small jitter keeps the press armed; past the threshold the scroller wins', () {
    final p = pressPending(2, 100, 200);
    expect(peekReduce(p, const PointerMove(2, 100 + peekMoveThreshold - 1, 200)).$1, same(p));
    final (s, e) = peekReduce(p, const PointerMove(2, 100 + peekMoveThreshold + 1, 200));
    expect(s, same(PeekState.idle));
    expect(e, isEmpty);
  });

  test('the hold timer lifts into peek with a haptic', () {
    final (s, e) = peekReduce(pressPending(4), const HoldElapsed());
    expect((s.phase, s.index), (PeekPhase.peeking, 4));
    expect(e.single, isA<Haptic>());
  });

  test('peeking: move browses, release selects (no auto-play), cancel drops', () {
    final (moved, me) = peekReduce(const PeekState(PeekPhase.peeking, index: 4), const PointerMove(7, 300, 200));
    expect((moved.phase, moved.index), (PeekPhase.peeking, 7));
    expect(me, isEmpty);
    final (sel, se) = peekReduce(const PeekState(PeekPhase.peeking, index: 7), const PointerUp());
    expect((sel.phase, sel.index), (PeekPhase.selected, 7));
    expect(se, isEmpty);
    expect(peekReduce(const PeekState(PeekPhase.peeking, index: 1), const Dismiss()).$1, same(PeekState.idle));
  });

  test('selected: confirm plays, dismiss drops, stray moves ignored', () {
    final (s, e) = peekReduce(const PeekState(PeekPhase.selected, index: 7), const Confirm(7));
    expect(s, same(PeekState.idle));
    expect(e.single, isA<ConfirmPlay>().having((c) => c.index, 'index', 7));
    const sel = PeekState(PeekPhase.selected, index: 7);
    expect(peekReduce(sel, const Dismiss()).$1, same(PeekState.idle));
    expect(peekReduce(sel, const PointerMove(3, 1, 1)).$1, same(sel));
  });
}
