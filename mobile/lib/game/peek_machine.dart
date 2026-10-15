// Port of frontend/src/utils/peekMachine.ts - the long-press peek gesture.
//
//   IDLE -> pointerdown -> PRESS_PENDING
//   PRESS_PENDING: up -> TAP_PLAY | move >8px -> IDLE | hold -> PEEKING
//   PEEKING: move -> browse | up -> SELECTED | cancel/dismiss -> IDLE
//   SELECTED: confirm -> CONFIRM_PLAY | dismiss/cancel -> IDLE

import 'dart:math' as math;

const peekMoveThreshold = 8.0;

enum PeekPhase { idle, pressPending, peeking, selected }

class PeekState {
  const PeekState(this.phase, {this.index = -1, this.startX = 0, this.startY = 0});
  final PeekPhase phase;
  final int index;
  final double startX;
  final double startY;

  static const idle = PeekState(PeekPhase.idle);
}

sealed class PeekEvent {
  const PeekEvent();
}

class PointerDown extends PeekEvent {
  const PointerDown(this.index, this.x, this.y);
  final int index;
  final double x, y;
}

class PointerMove extends PeekEvent {
  const PointerMove(this.index, this.x, this.y);
  final int index;
  final double x, y;
}

class PointerUp extends PeekEvent {
  const PointerUp();
}

class HoldElapsed extends PeekEvent {
  const HoldElapsed();
}

class PointerCancel extends PeekEvent {
  const PointerCancel();
}

class Confirm extends PeekEvent {
  const Confirm(this.index);
  final int index;
}

class Dismiss extends PeekEvent {
  const Dismiss();
}

sealed class PeekEffect {
  const PeekEffect();
}

class TapPlay extends PeekEffect {
  const TapPlay(this.index);
  final int index;
}

class Haptic extends PeekEffect {
  const Haptic();
}

class ConfirmPlay extends PeekEffect {
  const ConfirmPlay(this.index);
  final int index;
}

(PeekState, List<PeekEffect>) peekReduce(PeekState state, PeekEvent event) {
  switch (state.phase) {
    case PeekPhase.idle:
      if (event is PointerDown) {
        return (PeekState(PeekPhase.pressPending, index: event.index, startX: event.x, startY: event.y), const []);
      }
      return (state, const []);

    case PeekPhase.pressPending:
      if (event is PointerMove) {
        final moved = math.sqrt(math.pow(event.x - state.startX, 2) + math.pow(event.y - state.startY, 2));
        return moved > peekMoveThreshold ? (PeekState.idle, const []) : (state, const []);
      }
      if (event is HoldElapsed) {
        return (PeekState(PeekPhase.peeking, index: state.index), const [Haptic()]);
      }
      if (event is PointerUp) return (PeekState.idle, [TapPlay(state.index)]);
      if (event is PointerCancel || event is Dismiss) return (PeekState.idle, const []);
      return (state, const []);

    case PeekPhase.peeking:
      if (event is PointerMove) return (PeekState(PeekPhase.peeking, index: event.index), const []);
      if (event is PointerUp) return (PeekState(PeekPhase.selected, index: state.index), const []);
      if (event is PointerCancel || event is Dismiss) return (PeekState.idle, const []);
      return (state, const []);

    case PeekPhase.selected:
      if (event is Confirm) return (PeekState.idle, [ConfirmPlay(event.index)]);
      if (event is Dismiss || event is PointerCancel) return (PeekState.idle, const []);
      return (state, const []);
  }
}
