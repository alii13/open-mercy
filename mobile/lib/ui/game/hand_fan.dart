// HandFan.vue (+ useHandPeek): the fan/scroll hand, card glow states, the
// long-press peek preview, and the fresh-card hold while a draw clone flies.
// Phones are coarse-pointer, so taps go through the peek gesture exactly as
// on the mobile web.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart' hide Card;
import 'package:flutter/services.dart';

import '../../engine/types.dart';
import '../../game/hand_layout.dart';
import '../../game/peek_machine.dart';
import '../../services/settings_store.dart';
import '../theme.dart';
import '../widgets/card_view.dart';
import '../widgets/outer_glow.dart';

const _holdMs = 280;
const _autoDismissMs = 4000;

String handCardLabel(Card card) {
  final color = card.isWild ? 'Wild' : card.color.name[0].toUpperCase() + card.color.name.substring(1);
  final name = switch (card.type) {
    CardType.number => card.value != null ? '${card.value}' : 'number',
    CardType.skip => 'Skip',
    CardType.reverse => 'Reverse',
    CardType.draw2 => 'Draw Two',
    CardType.draw4 => 'Draw Four',
    CardType.draw6 => 'Draw Six',
    CardType.draw10 => 'Draw Ten',
    CardType.skipEveryone => 'Skip Everyone',
    CardType.discardAll => 'Discard All',
    CardType.wild => 'Wild',
    CardType.wildReverseDraw4 => 'Wild Reverse Draw Four',
    CardType.wildColorRoulette => 'Wild Color Roulette',
  };
  return card.isWild ? name : '$color $name';
}

class HandFan extends StatefulWidget {
  const HandFan({
    super.key,
    required this.cards,
    required this.isMyTurn,
    required this.canPlay,
    required this.onPlay,
    this.disabled = false,
  });

  final List<Card> cards;
  final bool isMyTurn;
  final bool Function(Card) canPlay;

  /// Fired with the card's on-screen rect so the host can fly the clone.
  final void Function(Card card, Rect? cardRect) onPlay;
  final bool disabled;

  @override
  State<HandFan> createState() => HandFanState();
}

class HandFanState extends State<HandFan> {
  final Map<String, GlobalKey> _cardKeys = {};
  final Set<String> _known = {};
  final Set<String> _hidden = {};
  final Set<String> _thrown = {};

  PeekState _peek = PeekState.idle;
  Timer? _holdTimer;
  Timer? _dismissTimer;
  int? _activePointer;
  final GlobalKey _previewKey = GlobalKey();
  final _shake = ValueNotifier<int>(0);

  @override
  void initState() {
    super.initState();
    _known.addAll(widget.cards.map((c) => c.id));
  }

  @override
  void didUpdateWidget(covariant HandFan oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Cards that just arrived stay invisible for 380ms while the flying
    // card-back clone is still travelling.
    final fresh = <String>[];
    for (final c in widget.cards) {
      if (_known.add(c.id)) fresh.add(c.id);
    }
    if (fresh.isNotEmpty) {
      _hidden.addAll(fresh);
      Timer(const Duration(milliseconds: 380), () {
        if (!mounted) return;
        setState(() => _hidden.removeAll(fresh));
      });
    }
    _thrown.removeWhere((id) => !widget.cards.any((c) => c.id == id));
    // Hand mutation (draw/play/swap) or losing the gesture resets the peek.
    if (oldWidget.cards.length != widget.cards.length || oldWidget.disabled != widget.disabled) {
      _clearTimers();
      _activePointer = null;
      if (_peek.phase != PeekPhase.idle) _peek = PeekState.idle;
    }
  }

  @override
  void dispose() {
    _clearTimers();
    _shake.dispose();
    super.dispose();
  }

  bool get _peekEnabled => !widget.disabled;

  void _clearTimers() {
    _holdTimer?.cancel();
    _dismissTimer?.cancel();
    _holdTimer = null;
    _dismissTimer = null;
  }

  void _dispatch(PeekEvent event) {
    final prev = _peek.phase;
    final (next, effects) = peekReduce(_peek, event);
    setState(() => _peek = next);
    for (final eff in effects) {
      switch (eff) {
        case Haptic():
          HapticFeedback.selectionClick();
        case TapPlay(:final index):
          _playByIndex(index);
        case ConfirmPlay(:final index):
          _playByIndex(index);
      }
    }
    if (next.phase != prev) {
      _clearTimers();
      if (next.phase == PeekPhase.pressPending) {
        _holdTimer = Timer(const Duration(milliseconds: _holdMs), () => _dispatch(const HoldElapsed()));
      } else if (next.phase == PeekPhase.selected) {
        _dismissTimer = Timer(const Duration(milliseconds: _autoDismissMs), () => _dispatch(const Dismiss()));
      }
    }
  }

  void _playByIndex(int index) {
    if (index < 0 || index >= widget.cards.length) return;
    _handleCardClick(widget.cards[index]);
  }

  bool _canPlayIndex(int index) {
    if (index < 0 || index >= widget.cards.length) return false;
    return widget.isMyTurn && !widget.disabled && widget.canPlay(widget.cards[index]);
  }

  void _handleCardClick(Card card) {
    if (widget.disabled) return;
    if (!widget.isMyTurn || !widget.canPlay(card)) return;
    final rect = _rectOf(card.id);
    setState(() => _thrown.add(card.id));
    widget.onPlay(card, rect);
  }

  Rect? _rectOf(String id) {
    final box = _cardKeys[id]?.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.attached) return null;
    return box.localToGlobal(Offset.zero) & box.size;
  }

  /// Nearest card centre to the finger - slide-to-browse while peeking.
  int _indexAtPoint(double globalX) {
    var best = math.max(0, _peek.index);
    var bestDist = double.infinity;
    for (final (i, c) in widget.cards.indexed) {
      final r = _rectOf(c.id);
      if (r == null) continue;
      final d = (r.center.dx - globalX).abs();
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  void _onPointerDown(PointerDownEvent e, int index) {
    if (!_peekEnabled) return;
    if (_peek.phase == PeekPhase.selected) _dispatch(const Dismiss());
    _activePointer = e.pointer;
    _dispatch(PointerDown(index, e.position.dx, e.position.dy));
  }

  void _onPointerMove(PointerMoveEvent e) {
    if (_activePointer != e.pointer) return;
    if (_peek.phase == PeekPhase.pressPending) {
      _dispatch(PointerMove(-1, e.position.dx, e.position.dy));
    } else if (_peek.phase == PeekPhase.peeking) {
      _dispatch(PointerMove(_indexAtPoint(e.position.dx), e.position.dx, e.position.dy));
    }
  }

  void _onPointerEnd(int pointer, PeekEvent event) {
    if (_activePointer != pointer) return;
    _activePointer = null;
    _dispatch(event);
  }

  void _onPreviewTap() {
    if (_peek.phase != PeekPhase.selected) return;
    final index = _peek.index;
    if (_canPlayIndex(index)) {
      _dispatch(Confirm(index));
    } else if (!motionReduced) {
      _shake.value++;
    }
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return LayoutBuilder(builder: (context, box) {
      final layout = computeHandLayout(
        viewportWidth: size.width,
        bandHeight: box.maxHeight,
        handSize: widget.cards.length,
        pointerCoarse: true,
      );
      final slots = layout.slots;
      final stripWidth = slots.isEmpty ? layout.cardW : slots.last.x + layout.cardW;
      final scroll = layout.mode == HandMode.scroll;

      Widget strip = SizedBox(
        width: stripWidth,
        height: layout.cardH,
        child: Listener(
          onPointerMove: _onPointerMove,
          onPointerUp: (e) => _onPointerEnd(e.pointer, const PointerUp()),
          onPointerCancel: (e) => _onPointerEnd(e.pointer, const PointerCancel()),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              for (final (i, card) in widget.cards.indexed)
                if (i < slots.length) _cardSlot(card, i, slots[i], layout),
            ],
          ),
        ),
      );

      // .not-my-turn .hand-scroller: grayscale .7, brightness .7, opacity .7
      if (!widget.isMyTurn) {
        strip = Opacity(opacity: 0.7, child: ColorFiltered(colorFilter: _notMyTurn, child: strip));
      }

      Widget scroller = scroll
          ? ShaderMask(
              shaderCallback: (r) => LinearGradient(
                colors: const [Color(0x00000000), Color(0xFF000000), Color(0xFF000000), Color(0x00000000)],
                stops: [0, 22 / r.width, 1 - 22 / r.width, 1],
              ).createShader(r),
              blendMode: BlendMode.dstIn,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                clipBehavior: Clip.hardEdge,
                physics: _peek.phase == PeekPhase.peeking ? const NeverScrollableScrollPhysics() : null,
                padding: const EdgeInsets.symmetric(horizontal: OmSpace.s3),
                child: strip,
              ),
            )
          : strip;

      final previewIndex = _peek.phase == PeekPhase.peeking || _peek.phase == PeekPhase.selected ? _peek.index : -1;
      final previewCard = previewIndex >= 0 && previewIndex < widget.cards.length ? widget.cards[previewIndex] : null;

      return Stack(
        clipBehavior: Clip.none,
        children: [
          // .hand-fan: padding 20 5 5 at phone width, cards bottom-aligned.
          Positioned.fill(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(5, 20, 5, 5),
              child: Align(alignment: Alignment.bottomCenter, child: scroller),
            ),
          ),
          if (_peek.phase == PeekPhase.selected)
            Positioned(
              left: -size.width,
              right: -size.width,
              top: -size.height,
              bottom: -size.height,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapDown: (_) => _dispatch(const Dismiss()),
              ),
            ),
          if (previewCard != null) _preview(previewCard, size, box.maxHeight),
        ],
      );
    });
  }

  Widget _cardSlot(Card card, int index, HandSlot slot, HandLayout layout) {
    final key = _cardKeys.putIfAbsent(card.id, () => GlobalKey());
    final playable = widget.isMyTurn && widget.canPlay(card);
    final unplayable = widget.isMyTurn && !widget.canPlay(card);
    final hidden = _hidden.contains(card.id) || _thrown.contains(card.id);

    Widget face = CardFace(card: card, width: layout.cardW, height: layout.cardH, isPlayable: playable);
    if (playable) face = _PlayableGlow(child: face);
    if (unplayable) {
      face = Opacity(opacity: 0.7, child: ColorFiltered(colorFilter: _brightness75, child: face));
    }

    return AnimatedPositioned(
      key: ValueKey(card.id),
      // Remaining cards slide into their new slots (Flip, 0.35s power3.out).
      duration: const Duration(milliseconds: 350),
      curve: const Cubic(0.215, 0.61, 0.355, 1),
      left: slot.x,
      bottom: 0,
      width: layout.cardW,
      height: layout.cardH,
      child: TweenAnimationBuilder<Offset>(
        // transition: transform .25s cubic-bezier(.175,.885,.32,1.275)
        tween: Tween(end: Offset(slot.arcY, slot.rotate)),
        duration: const Duration(milliseconds: 250),
        curve: const Cubic(0.175, 0.885, 0.32, 1.275),
        builder: (context, v, child) => Transform(
          alignment: Alignment.bottomCenter,
          transform: Matrix4.translationValues(0, v.dx, 0)..rotateZ(v.dy * math.pi / 180),
          child: child,
        ),
        child: Listener(
          onPointerDown: (e) => _onPointerDown(e, index),
          child: Semantics(
            button: true,
            label: handCardLabel(card) + (playable ? ', playable' : ''),
            child: AnimatedOpacity(
              opacity: hidden ? 0 : 1,
              duration: const Duration(milliseconds: 200),
              child: KeyedSubtree(key: key, child: face),
            ),
          ),
        ),
      ),
    );
  }

  Widget _preview(Card card, Size screen, double bandHeight) {
    var w = math.min(190.0, math.max(120.0, screen.width * 0.34));
    var h = w * 1.4;
    final hCap = screen.height * 0.6;
    if (h > hCap) {
      h = hCap;
      w = h / 1.4;
    }
    w = w.roundToDouble();
    h = h.roundToDouble();
    final selected = _peek.phase == PeekPhase.selected;
    final playable = widget.isMyTurn && !widget.disabled && widget.canPlay(card);
    final hint = selected ? (playable ? 'TAP TO PLAY' : "CAN'T PLAY") : handCardLabel(card);
    final hintActive = selected && playable;

    return Positioned(
      left: 0,
      right: 0,
      // bottom: calc(100% - 48px) - float above the band, over the pit.
      bottom: bandHeight - 48,
      child: Center(
        child: TweenAnimationBuilder<double>(
          key: _previewKey,
          tween: Tween(begin: motionReduced ? 1 : 0, end: 1),
          duration: const Duration(milliseconds: 180),
          curve: const Cubic(0.2, 0.9, 0.3, 1.35),
          builder: (context, t, child) => Opacity(
            opacity: t.clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(0, 14 * (1 - t)),
              child: Transform.scale(scale: 0.9 + 0.1 * t, child: child),
            ),
          ),
          child: ValueListenableBuilder<int>(
            valueListenable: _shake,
            builder: (context, n, child) => TweenAnimationBuilder<double>(
              key: ValueKey(n),
              tween: Tween(begin: n == 0 ? 0 : -9, end: 0),
              duration: const Duration(milliseconds: 450),
              curve: Curves.elasticOut,
              builder: (context, x, child) => Transform.translate(offset: Offset(x, 0), child: child),
              child: child,
            ),
            child: GestureDetector(
              onTap: _onPreviewTap,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DecoratedBox(
                    decoration: const BoxDecoration(
                      boxShadow: [BoxShadow(color: Color(0xB3000000), offset: Offset(0, 22), blurRadius: 38)],
                    ),
                    child: CardFace(card: card, width: w, height: h, isPlayable: playable),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    decoration: BoxDecoration(
                      color: hintActive ? OmColors.neonBlue : const Color(0xE0080A0E),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: hintActive ? Colors.transparent : const Color(0x24FFFFFF)),
                    ),
                    child: Text(
                      hint,
                      style: displayText(12.5, color: hintActive ? const Color(0xFF04121A) : OmColors.textSecondary, ls: 0.14),
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

/// .playable-glow .hand-card: cyan border + glow, plus a slow cyan pulse.
class _PlayableGlow extends StatefulWidget {
  const _PlayableGlow({required this.child});
  final Widget child;

  @override
  State<_PlayableGlow> createState() => _PlayableGlowState();
}

class _PlayableGlowState extends State<_PlayableGlow> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

  @override
  void initState() {
    super.initState();
    if (!motionReduced) _c.repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) => OuterGlow(
        radius: BorderRadius.circular(8),
        shadows: [
          const BoxShadow(color: Color(0x8000F3FF), blurRadius: 15),
          BoxShadow(
            color: const Color(0xD900F3FF).withValues(alpha: 0.85 * Curves.easeInOut.transform(_c.value)),
            blurRadius: 22,
          ),
        ],
        child: Container(
          foregroundDecoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xCC00F3FF)),
          ),
          child: child,
        ),
      ),
      child: widget.child,
    );
  }
}

/// grayscale(0.7) brightness(0.7)
const _notMyTurn = ColorFilter.matrix(<double>[
  0.3141, 0.3504, 0.0354, 0, 0,
  0.1031, 0.5614, 0.0354, 0, 0,
  0.1031, 0.3504, 0.2464, 0, 0,
  0, 0, 0, 1, 0,
]);

const _brightness75 = ColorFilter.matrix(<double>[
  0.75, 0, 0, 0, 0,
  0, 0.75, 0, 0, 0,
  0, 0, 0.75, 0, 0,
  0, 0, 0, 1, 0,
]);
