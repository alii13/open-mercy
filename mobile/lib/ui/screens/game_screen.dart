// GameView.vue - the solo table. Owns its GameController.

import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart' hide Card;

import '../../engine/bot.dart';
import '../../engine/rules.dart';
import '../../engine/seeded_rng.dart';
import '../../engine/types.dart';
import '../../game/badges.dart';
import '../../game/game_controller.dart';
import '../../game/local_store.dart';
import '../../services/music.dart';
import '../../services/retention_store.dart';
import '../../services/settings_store.dart';
import '../../services/sound_effects.dart';
import '../fx/cinematics.dart';
import '../fx/fx_overlay.dart';
import '../game/battle_pit.dart';
import '../game/game_over_modal.dart';
import '../game/hand_fan.dart';
import '../game/hud.dart';
import '../game/pickers.dart';
import '../theme.dart';
import '../widgets/card_view.dart';

/// useFxWiring.slamMagnitude
int slamMagnitude(Card card) {
  final m = RegExp(r'^draw(\d+)$').firstMatch(card.type.name);
  if (m != null) return int.parse(m.group(1)!);
  if (card.type == CardType.skipEveryone) return 8;
  if (card.isWild) return 6;
  return 4;
}

const stackCamThreshold = 10;

bool _isPowerCard(Card c) => c.isWild || c.type.name.contains('draw') || c.type == CardType.skipEveryone;

class GameScreen extends StatefulWidget {
  const GameScreen({super.key, required this.controller, required this.store});

  final GameController controller;
  final LocalStore store;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> with TickerProviderStateMixin {
  GameController get store => widget.controller;
  final sfx = SoundEffects.instance;
  final music = Music.instance;
  final retention = RetentionStore.instance;

  final _fx = GlobalKey<FxOverlayState>();
  final _stackCam = GlobalKey<StackCamState>();
  final _badgeUp = GlobalKey<BadgeUpBannerState>();
  final _deckKey = GlobalKey();
  final _deckPile = GlobalKey<DrawPileState>();
  final _discard = GlobalKey<DiscardPileState>();
  final _pitTable = GlobalKey();
  final _handWrapper = GlobalKey();
  final Map<String, GlobalKey<OpponentChipState>> _seats = {};

  static const myPlayerId = humanId;

  bool _showColorPicker = false;
  Card? _pendingWildCard;
  bool _turnBannerShown = false;
  bool _desaturate = false;

  // Previous values for the watcher emulation.
  Map<String, int> _prevHandLengths = {};
  int? _prevLastPlayN;
  String? _prevCurrentId;
  bool _prevDealing = false;
  GameState _prevGameState = GameState.lobby;
  int _prevElim = 0;
  Map<String, bool> _prevCalled = {};
  int _prevDrawStack = 0;
  int _prevDirection = 1;
  CardColor? _prevColor;
  int _prevPlayers = 0;
  Object? _promptKey;
  bool _promptOpen = false;

  // .shake-screen (0.5s, GameView) + body shake (stack escalation).
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
  late final AnimationController _bodyShake = AnimationController(vsync: this);
  bool _bodyHeavy = false;

  // useBadgeUp: guests reverse this game out of the local tally.
  @override
  void initState() {
    super.initState();
    store.addListener(_onStore);
    SettingsStore.instance.addListener(_rebuild);
    sfx.addListener(_rebuild);
    _snapshot();
    WidgetsBinding.instance.addPostFrameCallback((_) => _onMounted());
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    store.removeListener(_onStore);
    SettingsStore.instance.removeListener(_rebuild);
    sfx.removeListener(_rebuild);
    music.stop();
    store.dispose();
    _shake.dispose();
    _bodyShake.dispose();
    super.dispose();
  }

  void _snapshot() {
    final s = store.s;
    _prevHandLengths = {for (final p in s.players) p.id: p.hand.length};
    _prevLastPlayN = store.lastPlay?.n;
    _prevCurrentId = store.currentPlayer?.id;
    _prevDealing = store.isDealing;
    _prevGameState = s.gameState;
    _prevElim = s.players.where((p) => p.isEliminated).length;
    _prevCalled = Map.of(s.hasCalledUno);
    _prevDrawStack = s.drawStack;
    _prevDirection = s.direction;
    _prevColor = s.currentColor;
    _prevPlayers = s.players.length;
  }

  Future<void> _onMounted() async {
    // preloadCardImages
    for (final c in const [CardColor.red, CardColor.blue, CardColor.green, CardColor.yellow]) {
      for (var v = 0; v <= 9; v++) {
        precacheImage(AssetImage(cardAsset(Card(id: '', color: c, type: CardType.number, value: v))), context);
      }
    }
    music.start();
    if (store.isDealing) await _dealSequence();
  }

  Future<void> _dealSequence() async {
    await _playDealerIntro();
    if (!mounted) return;
    await store.dealInitialCards(_animateSingleCardDeal);
  }

  /// useDealerIntro: title swoop + deck riffle, ~1s.
  Future<void> _playDealerIntro() async {
    if (motionReduced) return;
    final pile = _deckPile.currentState;
    if (pile == null) return;
    final riffle = Future<void>.delayed(const Duration(milliseconds: 50), pile.riffle);
    final title = _fx.currentState?.dealTitle(hold: const Duration(milliseconds: 450)) ?? Future.value();
    await Future.wait([riffle, title]);
  }

  Rect? _seatRect(String playerId) =>
      playerId == myPlayerId ? globalRect(_handWrapper) : globalRect(_seats[playerId] ?? GlobalKey());

  Future<void> _animateSingleCardDeal(String playerId, Card _) async {
    final deck = globalRect(_deckKey);
    final target = _seatRect(playerId);
    if (deck == null || target == null) return;
    sfx.playCardPick();
    await _fx.currentState?.flyCardBack(deck, target, duration: 0.3);
  }

  // ---- store watchers ------------------------------------------------------

  void _onStore() {
    if (!mounted) return;
    final s = store.s;

    // A new game in the same mounted view (rematch / daily from game over).
    if (store.isDealing && !_prevDealing) {
      _prevHandLengths = {};
      _turnBannerShown = false;
      _showColorPicker = false;
      _pendingWildCard = null;
      _promptKey = null;
      _prevDealing = true;
      unawaited(_dealSequence());
    }

    // lastPlay (flush: 'sync') - must set suppressDiscardSlam before the pile
    // rebuilds with the new card.
    final lp = store.lastPlay;
    if (lp != null && lp.n != _prevLastPlayN && !store.isDealing) {
      _prevLastPlayN = lp.n;
      _onLastPlay(lp);
    }

    // Draw animations: a hand that grew while not dealing.
    final nextLengths = {for (final p in s.players) p.id: p.hand.length};
    for (final e in nextLengths.entries) {
      final old = _prevHandLengths[e.key] ?? 0;
      if (!store.isDealing && e.value > old && old > 0) {
        final deck = globalRect(_deckKey);
        final target = _seatRect(e.key);
        if (deck != null && target != null) {
          _fx.currentState?.drawStaggered(deck, target, e.value - old, duration: 0.4, stagger: 0.15);
        }
      }
    }
    _prevHandLengths = nextLengths;

    // Turn handoff: banner the first time it lands on the human, pulse a bot.
    final curId = store.currentPlayer?.id;
    if (s.gameState == GameState.playing && !store.isDealing) {
      if (curId == myPlayerId && (_prevCurrentId != myPlayerId || _prevDealing)) {
        if (!_turnBannerShown) {
          _turnBannerShown = true;
          _fx.currentState?.turnBanner();
        }
      } else if (curId != null && curId != myPlayerId && curId != _prevCurrentId) {
        _seats[curId]?.currentState?.pulse();
      }
    }
    _prevCurrentId = curId;
    _prevDealing = store.isDealing;

    // KO beat.
    final elim = s.players.where((p) => p.isEliminated).length;
    if (elim > _prevElim && _prevPlayers == s.players.length) _ko();
    _prevElim = elim;
    _prevPlayers = s.players.length;

    // Mercy call flare.
    for (final e in s.hasCalledUno.entries) {
      if (e.value && _prevCalled[e.key] != true) {
        final seat = _seatRect(e.key);
        if (seat != null) _fx.currentState?.burst(seat.center, CardColor.yellow, 20);
      }
    }
    _prevCalled = Map.of(s.hasCalledUno);

    _onDrawStack(_prevDrawStack, s.drawStack);
    _prevDrawStack = s.drawStack;

    // Direction reversal sweep.
    if (s.direction != _prevDirection) {
      final table = globalRect(_pitTable);
      if (table != null) _fx.currentState?.sweepDirectionRing(table, s.direction);
    }
    _prevDirection = s.direction;

    // Wild colour flood: colour changed while the top card is a wild.
    if (s.currentColor != _prevColor && s.currentColor != CardColor.wild && store.topCard?.isWild == true) {
      _fx.currentState?.colorWash(s.currentColor);
      final d = globalRect(_discard);
      if (d != null) _fx.currentState?.shockwave(d.center, s.currentColor, 520, 0.8);
    }
    _prevColor = s.currentColor;

    if (s.gameState != _prevGameState) _onGameState(_prevGameState, s.gameState);
    _prevGameState = s.gameState;

    // Safety: close the from-hand wild picker if the turn moves on.
    if (_showColorPicker && (!_isMyTurn || s.gameState == GameState.gameOver)) {
      _showColorPicker = false;
      _pendingWildCard = null;
    }

    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybePrompt());
  }

  void _onLastPlay(LastPlay play) {
    final discard = globalRect(_discard);
    final isHuman = play.playerId == myPlayerId;
    final power = _isPowerCard(play.card);
    if (!isHuman && discard != null) {
      final from = _seatRect(play.playerId);
      if (from != null) {
        store.suppressDiscardSlam = true;
        _fx.currentState?.opponentThrow(play.card, from, discard, onImpact: () => _impact(play.card, power));
      }
    }
    if (play.card.type == CardType.skipEveryone && discard != null) {
      final victims = store.players
          .where((p) => p.id != myPlayerId && !p.isEliminated && p.id != play.playerId)
          .map((p) => p.id)
          .toList();
      Timer(const Duration(milliseconds: 480), () {
        final rects = [for (final id in victims) _seatRect(id)].whereType<Rect>().toList();
        _fx.currentState?.skipEveryoneShockwave(discard, rects,
            shakeSeat: (i) => _seats[victims[i]]?.currentState?.shake());
      });
    }
  }

  /// fx.emit('impact') + fx.emit('slam') at the pile.
  void _impact(Card card, bool power, {bool pileFlash = false}) {
    final d = globalRect(_discard);
    if (d == null) return;
    final fx = _fx.currentState;
    fx?.burst(d.center, card.color, power ? 20 : 10);
    if (power) {
      if (pileFlash) fx?.pileFlash(d, card.color);
      fx?.edgeFlash(card.color);
      fx?.shockwave(d.center, card.color, 170 + slamMagnitude(card) * 14.0);
    }
  }

  void _onDrawStack(int old, int now) {
    // GameView: shake on a big increase.
    if (now > old && now >= 6 && !motionReduced) _shake.forward(from: 0);
    // useStackEscalation: light/heavy body shake on any increase >= 4.
    if (now > old && now >= 4 && !motionReduced) {
      _bodyHeavy = now >= 8;
      _bodyShake.duration = Duration(milliseconds: _bodyHeavy ? 600 : 350);
      _bodyShake.forward(from: 0);
    }
    // useStackCamWiring
    if (now >= stackCamThreshold) {
      _stackCam.currentState?.ignite(now, store.s.currentColor);
    } else if (old >= stackCamThreshold && now > 0) {
      _stackCam.currentState?.reveal(old, store.s.currentColor, null, '', null);
    }
    // Stack eaten: spray from the pile into the victim's seat.
    if (old >= 6 && now == 0) {
      final discard = globalRect(_discard);
      final victim = store.currentPlayer;
      final seat = victim == null ? null : _seatRect(victim.id);
      if (discard != null && seat != null) _fx.currentState?.spray(discard.center, seat.center, store.s.currentColor, old * 3);
      if (old >= stackCamThreshold) {
        _stackCam.currentState?.reveal(old, store.s.currentColor, seat, victim?.name ?? '', discard);
      }
    }
  }

  void _ko() {
    _fx.currentState?.koFlash();
    if (motionReduced) return;
    setState(() => _desaturate = true);
    Timer(const Duration(milliseconds: 520), () {
      if (mounted) setState(() => _desaturate = false);
    });
  }

  void _onGameState(GameState prev, GameState now) {
    if (now == GameState.gameOver) {
      final won = store.s.winnerId == myPlayerId;
      if (won) {
        final d = globalRect(_discard);
        final size = MediaQuery.sizeOf(context);
        _fx.currentState?.confetti(d?.center ?? Offset(size.width / 2, size.height * 0.4), 110);
      }
      music.duck();
      final st = store.playerStats[myPlayerId];
      if (st != null) {
        retention.recordGameResult(GameResult(
          won: won,
          cardsPlayed: st.cardsPlayedTotal,
          biggestStackSurvived: st.biggestStackSurvived,
          unoCalls: st.unoCalls,
          peakHand: st.peakCards,
          mode: 'sp',
        ));
        // Guest badge-up: reverse this game out of the updated tally.
        final after = pointsFromRetention(
            gamesPlayed: retention.gamesPlayed, gamesWon: retention.gamesWon, unoCalls: retention.totalUnos);
        final before = pointsFromRetention(
          gamesPlayed: retention.gamesPlayed - 1,
          gamesWon: retention.gamesWon - (won ? 1 : 0),
          unoCalls: retention.totalUnos - st.unoCalls,
        );
        final a = badgeFor(after);
        if (a.tier > badgeFor(before).tier) {
          _badgeUp.currentState?.enqueue(store.human?.name ?? 'You', a.tier, true);
        }
      }
    } else if (prev == GameState.gameOver && now == GameState.playing) {
      music.unduck();
    } else if (now == GameState.lobby && mounted) {
      // returnToLobby: App.vue swaps back to the lobby screen.
      Navigator.of(context).pop();
    }
  }

  // ---- derived -------------------------------------------------------------

  bool get _isMyTurn => store.currentPlayer?.id == myPlayerId;
  Player? get _me => store.players.where((p) => p.id == myPlayerId).firstOrNull;

  bool _canPlayFromHand(Card card) {
    if (!_isMyTurn) return false;
    if (store.s.turnState != TurnState.waitingForAction) return false;
    if (store.actionInProgress) return false;
    final top = store.topCard;
    if (top == null) return false;
    return canPlayCard(card, top, store.s.currentColor, store.s.drawStack, store.s.stackingMode);
  }

  String get _turnLabel {
    if (store.s.gameState == GameState.gameOver) return '';
    if (_isMyTurn) return 'YOUR TURN';
    final name = store.currentPlayer?.name;
    return name != null && name != 'Unknown' ? "${name.toUpperCase()}'S TURN" : "OPPONENT'S TURN";
  }

  String get _gameMessage {
    final ts = store.s.turnState;
    if (ts == TurnState.choosingPlayerToSwap) {
      return _isMyTurn ? 'SELECT PLAYER TO SWAP HANDS' : 'BOT IS CHOOSING SWAP TARGET...';
    }
    if (ts == TurnState.choosingRouletteColor) {
      return _isMyTurn ? 'INCOMING ROULETTE! CHOOSE YOUR FATE' : 'ROULETTE INITIATED: WAITING FOR VICTIM...';
    }
    if (ts == TurnState.rouletteDrawing) {
      final target = (store.s.rouletteTargetColor ?? store.s.currentColor).name.toUpperCase();
      return _isMyTurn ? 'DANGER: YOU NEED $target' : 'BOT IS SEEKING $target...';
    }
    return '';
  }

  Color? get _messageColor {
    if (store.s.turnState != TurnState.rouletteDrawing) return null;
    return switch (store.s.rouletteTargetColor ?? store.s.currentColor) {
      CardColor.red => const Color(0xFFFF5555),
      CardColor.blue => const Color(0xFF5555FF),
      CardColor.green => const Color(0xFF55FF55),
      CardColor.yellow => const Color(0xFFFFFF55),
      CardColor.wild => Colors.white,
    };
  }

  BadgeTier? _seatBadge(String playerId) {
    final prof = store.botProfiles[playerId];
    if (prof == null) return null;
    final rung = botLadder.indexWhere((b) => b.id == prof.id) + 1;
    return rung > 0 ? botBadge(rung) : null;
  }

  // ---- actions -------------------------------------------------------------

  void _handlePlayFromHand(Card card, Rect? cardRect) {
    sfx.playCardThrow();
    final discard = globalRect(_discard);
    if (cardRect != null && discard != null) {
      _fx.currentState?.throwFromHand(card, cardRect, discard,
          onImpact: () => _impact(card, _isPowerCard(card), pileFlash: true));
    }
    // Wild (non-roulette) needs a colour first; roulette colour is post-play.
    if (card.isWild && card.type != CardType.wildColorRoulette) {
      setState(() {
        _pendingWildCard = card;
        _showColorPicker = true;
      });
      return;
    }
    store.suppressDiscardSlam = true;
    store.playerActionPlayCard(card);
  }

  void _handleWildColorSelect(CardColor color) {
    final card = _pendingWildCard;
    setState(() => _showColorPicker = false);
    if (card != null) {
      store.suppressDiscardSlam = true;
      store.playerActionPlayCard(card, color);
      _pendingWildCard = null;
    }
  }

  void _drawCard() {
    if (!_isMyTurn || store.s.turnState != TurnState.waitingForAction) return;
    if (store.actionInProgress) return;
    final top = store.topCard;
    final me = _me;
    if (store.s.drawStack == 0 && top != null && me != null) {
      final hasPlayable = me.hand.any((c) => canPlayCard(c, top, store.s.currentColor, 0, store.s.stackingMode));
      if (hasPlayable) return;
    }
    sfx.playCardPick();
    store.drawCardsForCurrentPlayer();
  }

  void _toggleSound() {
    sfx.toggleMute();
    music.toggleMute();
  }

  Future<void> _confirmLeave() async {
    final leave = await showConfirmDialog(
      context,
      title: 'Leave the game?',
      message: "This match against the bot will end and you'll return to the lobby.",
      confirmLabel: 'LEAVE',
      cancelLabel: 'STAY',
    );
    if (leave && mounted) store.returnToLobby();
  }

  void _onOpponentTap(String playerId) {
    if (store.s.turnState == TurnState.choosingPlayerToSwap && _isMyTurn) store.swapHands(playerId);
  }

  /// PlayerSelectModal / DiscardAllPickerModal as sheets, once per decision.
  Future<void> _maybePrompt() async {
    if (!mounted || _promptOpen || !_isMyTurn || store.s.gameState != GameState.playing) return;
    final ts = store.s.turnState;
    final key = (ts, store.lastPlay?.n, store.s.discardPile.length);
    if (key == _promptKey) return;
    if (ts == TurnState.choosingPlayerToSwap) {
      _promptKey = key;
      _promptOpen = true;
      final id = await showPlayerSelect(
        context,
        store.players.where((p) => !p.isEliminated && p.id != myPlayerId).toList(),
      );
      _promptOpen = false;
      if (store.s.turnState != TurnState.choosingPlayerToSwap) return;
      id == null ? store.skipSwap() : store.swapHands(id);
    } else if (ts == TurnState.choosingDiscardAllTop) {
      _promptKey = key;
      _promptOpen = true;
      final id = await showDiscardAllPicker(context, store.s.pendingDiscardAllCards);
      _promptOpen = false;
      if (id != null) store.selectDiscardAllTop(id);
    }
  }

  // ---- build ---------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final s = store.s;
    final size = MediaQuery.sizeOf(context);
    final me = _me;
    final opponents = store.players.where((p) => p.id != myPlayerId).toList();
    final bandH = (size.height * 0.22).clamp(150.0, 210.0);
    final myTurnReady = _isMyTurn && s.turnState == TurnState.waitingForAction;
    final caught = store.catchableBot;
    final myCounts = countByColor(me?.hand ?? const []);

    final console = ConsoleBar(
      showUnoButton: store.showUnoButton,
      onCallUno: () => store.callUno(myPlayerId),
      caughtName: caught?.name,
      onCatch: caught == null ? null : () => store.catchNoUno(caught.id),
    );

    Widget? colorPicker;
    if (s.turnState == TurnState.choosingRouletteColor && _isMyTurn) {
      colorPicker = ColorPickerPanel(
        key: const ValueKey('roulette'),
        title: 'ROULETTE TRAP DETECTED',
        subtitle: 'CHOOSE YOUR FATE',
        isRoulette: true,
        colorCounts: myCounts,
        onSelect: store.setRouletteColor,
      );
    } else if (s.turnState == TurnState.choosingDrawnWildColor && _isMyTurn) {
      colorPicker = ColorPickerPanel(
        key: const ValueKey('drawn'),
        title: 'WILD CARD DRAWN',
        subtitle: 'CHOOSE COLOR TO PLAY',
        card: store.pendingDrawnWildCard,
        colorCounts: myCounts,
        onSelect: store.playDrawnWildCard,
      );
    } else if (_showColorPicker) {
      colorPicker = ColorPickerPanel(
        key: const ValueKey('hand'),
        title: 'WILD CARD ACTIVATED',
        subtitle: 'CHOOSE NEXT COLOR',
        colorCounts: myCounts,
        onSelect: _handleWildColorSelect,
      );
    }

    final table = Stack(
      children: [
        Positioned.fill(child: Container(color: OmColors.bgConcrete)),
        const Positioned.fill(child: GameBackground()),
        Column(
          children: [
            SurveillanceBar(
              opponents: [
                for (final p in opponents)
                  OpponentChip(
                    key: _seats.putIfAbsent(p.id, () => GlobalKey<OpponentChipState>()),
                    name: p.name,
                    badge: _seatBadge(p.id),
                    cardCount: p.hand.length,
                    isActive: p.id == store.currentPlayer?.id,
                    isSelectable: s.turnState == TurnState.choosingPlayerToSwap && _isMyTurn,
                    isEliminated: p.isEliminated,
                    onTap: () => _onOpponentTap(p.id),
                  ),
              ],
              controls: [
                HudExitButton(onTap: _confirmLeave),
                HudAudioButton(active: !sfx.isMuted, onTap: _toggleSound),
                const SettingsButton(),
              ],
            ),
            StatusTicker(
              turnLabel: _turnLabel,
              turnIsMine: _isMyTurn,
              message: _gameMessage,
              messageColor: _messageColor,
            ),
            Expanded(
              child: BattlePit(
                deckKey: _deckKey,
                deckPileKey: _deckPile,
                discardKey: _discard,
                pitTableKey: _pitTable,
                deckCount: s.deck.length,
                discardPile: s.discardPile,
                currentColor: s.currentColor,
                direction: s.direction,
                drawStack: s.drawStack,
                myCardCount: me?.hand.length,
                showDrawHint: myTurnReady,
                onDraw: _drawCard,
                consumeSuppressSlam: () {
                  final v = store.suppressDiscardSlam;
                  store.suppressDiscardSlam = false;
                  return v;
                },
              ),
            ),
            // .floating-hand-wrapper
            SizedBox(
              key: _handWrapper,
              height: bandH,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  // Hand tray gradient, bleeding 40px up and past the sides.
                  const Positioned(
                    left: -32,
                    right: -32,
                    top: -40,
                    bottom: 0,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [Color(0x00000000), Color(0x59000000), Color(0xA6000000), Color(0xD9000000)],
                            stops: [0, 0.35, 0.7, 1],
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (myTurnReady) const _TurnHalo(),
                  Positioned.fill(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: OmSpace.s1),
                      child: me == null
                          ? const SizedBox.shrink()
                          : HandFan(
                              cards: me.hand,
                              isMyTurn: _isMyTurn,
                              canPlay: _canPlayFromHand,
                              disabled: _showColorPicker,
                              onPlay: _handlePlayFromHand,
                            ),
                    ),
                  ),
                ],
              ),
            ),
            console,
          ],
        ),
        // Colour picker scrim over grid rows 1-3 (everything above the hand).
        if (colorPicker != null)
          Positioned.fill(
            child: Column(
              children: [
                Expanded(child: colorPicker),
                SizedBox(height: bandH),
                IgnorePointer(child: Visibility(visible: false, maintainSize: true, maintainAnimation: true, maintainState: true, child: console)),
              ],
            ),
          ),
      ],
    );

    Widget view = AnimatedBuilder(
      animation: Listenable.merge([_shake, _bodyShake]),
      builder: (context, child) {
        var dx = 0.0, dy = 0.0, rot = 0.0;
        if (_shake.isAnimating) {
          final (x, r) = _screenShake(_shake.value);
          dx += x;
          rot += r;
        }
        if (_bodyShake.isAnimating) {
          final (x, y, r) = _bodyHeavy ? _heavyShake(_bodyShake.value) : _lightShake(_bodyShake.value);
          dx += x;
          dy += y;
          rot += r;
        }
        return Transform.translate(
          offset: Offset(dx, dy),
          child: Transform.rotate(angle: rot * math.pi / 180, child: child),
        );
      },
      child: table,
    );
    // Always wrapped, so toggling the KO beat never remounts the table.
    view = ColorFiltered(colorFilter: _desaturate ? _koDesat : _identity, child: view);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && s.gameState != GameState.gameOver) _confirmLeave();
      },
      child: Scaffold(
        backgroundColor: OmColors.bgConcrete,
        body: Stack(
          children: [
            Positioned.fill(child: view),
            // Stack vignette is z-index 50 on the web, under the modal.
            Positioned.fill(child: StackVignette(drawStack: s.drawStack)),
            // Web z-order: GameOverModal (--z-modal 1000) sits under the FX
            // canvas, stack cam and badge-up banner (2100-2400).
            if (s.gameState == GameState.gameOver)
              Positioned.fill(
                child: GameOverModal(
                  key: ValueKey('over-${store.lastPlay?.n}'),
                  isWinner: s.winnerId == myPlayerId,
                  winnerName: store.players.where((p) => p.id == s.winnerId).firstOrNull?.name ?? 'UNKNOWN_ENTITY',
                  opponentName: store.players.where((p) => p.id != myPlayerId).firstOrNull?.name ?? 'opponent',
                  stats: _stats,
                  // Guest/claim flow arrives with accounts (BUGS.md / next phase).
                  isAnonymous: false,
                  daily: store.dailyDate == null && widget.store.todaysDaily == null ? retention.effectiveStreak : null,
                  onRematch: () => store.initializeGame(const ['You', 'Terminator']),
                  onPlayDaily: () =>
                      store.initializeGame(const ['You', 'Terminator'], mode: StackingMode.official, dailySeed: localDateString()),
                  onBackToLobby: store.returnToLobby,
                  onUpgradeAccount: store.returnToLobby,
                ),
              ),
            Positioned.fill(child: StackCam(key: _stackCam, fx: _fx)),
            Positioned.fill(child: FxOverlay(key: _fx)),
            Positioned.fill(child: Stack(children: [BadgeUpBanner(key: _badgeUp, fx: _fx)])),
          ],
        ),
      ),
    );
  }

  GameOverStats? get _stats {
    final st = store.playerStats[myPlayerId];
    if (st == null) return null;
    return GameOverStats(
      cardsPlayed: st.cardsPlayedTotal,
      biggestStack: st.biggestStackSurvived,
      unosCalled: st.unoCalls,
      peakHand: st.peakCards,
    );
  }
}

/// The "your turn" halo under the hand (.is-my-turn::after).
class _TurnHalo extends StatefulWidget {
  const _TurnHalo();

  @override
  State<_TurnHalo> createState() => _TurnHaloState();
}

class _TurnHaloState extends State<_TurnHalo> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200));

  @override
  void initState() {
    super.initState();
    if (!motionReduced) {
      _c.repeat(reverse: true);
    } else {
      _c.value = 0.3;
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: -8,
      height: 18,
      child: IgnorePointer(
        child: FractionallySizedBox(
          widthFactor: 0.8,
          child: AnimatedBuilder(
            animation: _c,
            builder: (context, child) =>
                Opacity(opacity: 0.55 + 0.45 * Curves.easeInOut.transform(_c.value), child: child),
            child: ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 4, sigmaY: 4),
              child: const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(colors: [Color(0x5900FF66), Color(0x0000FF66)], stops: [0, 0.7]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const _identity = ColorFilter.matrix(<double>[
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
]);

/// saturate(0.2) brightness(0.88)
const _koDesat = ColorFilter.matrix(<double>[
  0.3155, 0.5038, 0.0607, 0, 0,
  0.1301, 0.6891, 0.0607, 0, 0,
  0.1301, 0.5038, 0.2462, 0, 0,
  0, 0, 0, 1, 0,
]);

/// @keyframes screen-shake (translate x, rotate deg)
(double, double) _screenShake(double t) {
  const frames = [
    (0.0, 0.0, 0.0),
    (0.1, -1.0, -1.0),
    (0.2, 2.0, 1.0),
    (0.3, -4.0, -2.0),
    (0.4, 4.0, 2.0),
    (0.5, -4.0, -2.0),
    (0.6, 4.0, 2.0),
    (0.7, -4.0, -2.0),
    (0.8, 2.0, 1.0),
    (0.9, -1.0, -1.0),
    (1.0, 0.0, 0.0),
  ];
  for (var i = 1; i < frames.length; i++) {
    if (t <= frames[i].$1) {
      final a = frames[i - 1], b = frames[i];
      final p = (t - a.$1) / (b.$1 - a.$1);
      return (a.$2 + (b.$2 - a.$2) * p, a.$3 + (b.$3 - a.$3) * p);
    }
  }
  return (0, 0);
}

(double, double, double) _lightShake(double t) => _kf(t, const [
      (0.0, 0.0, 0.0, 0.0),
      (0.2, -2.0, 1.0, 0.0),
      (0.4, 2.0, -1.0, 0.0),
      (0.6, -1.0, 2.0, 0.0),
      (0.8, 1.0, -2.0, 0.0),
      (1.0, 0.0, 0.0, 0.0),
    ]);

(double, double, double) _heavyShake(double t) => _kf(t, const [
      (0.0, 0.0, 0.0, 0.0),
      (0.10, -6.0, 2.0, -0.3),
      (0.25, 5.0, -3.0, 0.4),
      (0.40, -4.0, 4.0, -0.2),
      (0.55, 6.0, -2.0, 0.3),
      (0.70, -3.0, 3.0, -0.2),
      (0.85, 2.0, -1.0, 0.0),
      (1.0, 0.0, 0.0, 0.0),
    ]);

(double, double, double) _kf(double t, List<(double, double, double, double)> frames) {
  final e = Curves.easeInOut.transform(t);
  for (var i = 1; i < frames.length; i++) {
    if (e <= frames[i].$1) {
      final a = frames[i - 1], b = frames[i];
      final p = (e - a.$1) / (b.$1 - a.$1);
      return (a.$2 + (b.$2 - a.$2) * p, a.$3 + (b.$3 - a.$3) * p, a.$4 + (b.$4 - a.$4) * p);
    }
  }
  return (0, 0, 0);
}
