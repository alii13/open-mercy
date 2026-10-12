// Dart port of shared/engine/bot.ts. Pure functions of (state, profile, rng),
// which is what keeps the seeded daily challenge reproducible.

import 'rules.dart';
import 'types.dart';

class BotProfile {
  const BotProfile({
    required this.id,
    required this.name,
    required this.aggression,
    required this.wildDiscipline,
    required this.catchRate,
    required this.targeting,
  });

  final String id;
  final String name;

  /// Leans on draw and skip cards rather than shedding numbers.
  final double aggression;

  /// Holds wilds back for when they are needed instead of dumping them.
  final double wildDiscipline;

  /// Chance of catching an opponent who forgot to call MERCY.
  final double catchRate;

  /// Chance of aiming a swap or a stack at the player who is winning.
  final double targeting;
}

/// Eight rungs. The dials climb together but not in lockstep.
const botLadder = <BotProfile>[
  BotProfile(id: 'scrap', name: 'Scrap', aggression: 0.15, wildDiscipline: 0.05, catchRate: 0.15, targeting: 0.0),
  BotProfile(id: 'pilot', name: 'Pilot', aggression: 0.30, wildDiscipline: 0.20, catchRate: 0.35, targeting: 0.0),
  BotProfile(id: 'vera', name: 'Vera', aggression: 0.20, wildDiscipline: 0.65, catchRate: 0.50, targeting: 0.2),
  BotProfile(id: 'rook', name: 'Rook', aggression: 0.55, wildDiscipline: 0.45, catchRate: 0.55, targeting: 0.5),
  BotProfile(id: 'marla', name: 'Marla', aggression: 0.75, wildDiscipline: 0.35, catchRate: 0.65, targeting: 0.6),
  BotProfile(id: 'kobra', name: 'Kobra', aggression: 0.85, wildDiscipline: 0.60, catchRate: 0.75, targeting: 0.75),
  BotProfile(id: 'zenith', name: 'Zenith', aggression: 0.70, wildDiscipline: 0.90, catchRate: 0.85, targeting: 0.85),
  BotProfile(id: 'terminator', name: 'Terminator', aggression: 0.90, wildDiscipline: 0.85, catchRate: 0.95, targeting: 1.0),
];

/// The daily challenge pins its opponent by id, never by ladder position.
const dailyBotId = 'terminator';

BotProfile botById(String id) => botLadder.firstWhere((b) => b.id == id, orElse: () => botLadder.first);

BotProfile dailyBot() => botById(dailyBotId);

class BotContext {
  const BotContext({this.playable = const [], this.drawStack = 0, this.opponents = const []});

  /// Cards the bot may legally play right now.
  final List<Card> playable;

  /// Live draw stack - non-zero means a chain is landing on someone.
  final int drawStack;

  /// Opponents still in the game, for targeting decisions.
  final List<Player> opponents;
}

/// Which card to play, or null when the bot should draw instead.
Card? chooseCard(BotContext ctx, BotProfile profile, Rng rng) {
  final playable = ctx.playable;
  if (playable.isEmpty) return null;

  if (ctx.drawStack > 0) {
    // Pass the stack on; an aggressive bot escalates with its biggest draw.
    // List.sort is not stable, so ties keep TS order via the index tiebreak.
    final indexed = playable.asMap().entries.toList()
      ..sort((a, b) {
        final byDraw = getDrawValue(b.value) - getDrawValue(a.value);
        return byDraw != 0 ? byDraw : a.key - b.key;
      });
    final byDraw = [for (final e in indexed) e.value];
    return rng() < profile.aggression ? byDraw.first : byDraw.last;
  }

  final specials = playable.where((c) => !c.isWild && c.type != CardType.number);
  final numbers = playable.where((c) => c.type == CardType.number);

  // Discipline is the chance of NOT spending a wild while a coloured option exists.
  final holdWild = rng() < profile.wildDiscipline;
  final coloured = [...specials, ...numbers];
  final pool = holdWild && coloured.isNotEmpty ? coloured : playable;

  final poolSpecials = pool.where((c) => c.type != CardType.number).toList();
  final poolNumbers = pool.where((c) => c.type == CardType.number).toList();

  if (poolSpecials.isNotEmpty && rng() < profile.aggression) return _pick(poolSpecials, rng);
  if (poolNumbers.isNotEmpty) return _pick(poolNumbers, rng);
  return _pick(pool, rng);
}

/// Who to hit with a swap. Sharper bots aim at whoever is closest to winning.
Player? chooseSwapTarget(BotContext ctx, BotProfile profile, Rng rng) {
  final alive = ctx.opponents.where((p) => !p.isEliminated).toList();
  if (alive.isEmpty) return null;
  if (rng() < profile.targeting) {
    return _minBy<Player>(alive, (p) => p.hand.length);
  }
  return _pick(alive, rng);
}

/// Whether this bot notices an opponent who failed to call MERCY.
bool willCatchMercy(BotProfile profile, Rng rng) => rng() < profile.catchRate;

/// Wild colour. A targeting bot picks the colour it holds most of; the rest
/// pick from what they hold at random.
CardColor chooseWildColor(List<Card> hand, BotProfile profile, Rng rng) {
  final counts = [
    for (final c in pickableColors) (color: c, n: hand.where((card) => card.color == c).length),
  ];
  final held = counts.where((x) => x.n > 0).toList();
  if (held.isEmpty) return pickableColors[(rng() * pickableColors.length).floor()];
  if (rng() < profile.targeting) {
    return _minBy(held, (x) => -x.n).color;
  }
  return held[(rng() * held.length).floor()].color;
}

T _pick<T>(List<T> list, Rng rng) => list[(rng() * list.length).floor()];

/// First element with the smallest key - matches a stable JS sort's [0].
T _minBy<T>(List<T> list, int Function(T) key) {
  var best = list.first;
  for (final x in list.skip(1)) {
    if (key(x) < key(best)) best = x;
  }
  return best;
}
