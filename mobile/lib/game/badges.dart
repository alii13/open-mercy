// Port of frontend/src/utils/badges.ts. The weighted points sum is mirrored
// server-side by supabase/badges.sql and leaderboards-alltime.sql; a weight
// change here must be made in all three.

import 'dart:math' as math;
import 'dart:ui';

class BadgeTier {
  const BadgeTier(this.tier, this.threshold, this.title, this.color);

  /// 1-10, also the emblem facet/rank count.
  final int tier;
  final int threshold;
  final String title;
  final Color color;

  String get art => 'assets/badges/${tier.toString().padLeft(2, '0')}-${_slug[tier - 1]}.png';
}

const _slug = [
  'recruit', 'scrapper', 'enforcer', 'savage', 'brute',
  'warlord', 'overlord', 'executioner', 'merciless', 'no-mercy-king',
];

const badges = <BadgeTier>[
  BadgeTier(1, 0, 'Recruit', Color(0xFF8A8F98)),
  BadgeTier(2, 250, 'Scrapper', Color(0xFF5ED17C)),
  BadgeTier(3, 600, 'Enforcer', Color(0xFF22D3EE)),
  BadgeTier(4, 1300, 'Savage', Color(0xFFF59E0B)),
  BadgeTier(5, 2700, 'Brute', Color(0xFFF97316)),
  BadgeTier(6, 5500, 'Warlord', Color(0xFFEF4444)),
  BadgeTier(7, 11000, 'Overlord', Color(0xFFEC4899)),
  BadgeTier(8, 22000, 'Executioner', Color(0xFFA855F7)),
  BadgeTier(9, 45000, 'Merciless', Color(0xFF7C3AED)),
  BadgeTier(10, 100000, 'No Mercy King', Color(0xFFFFD700)),
];

BadgeTier badgeFor(num points) {
  var current = badges.first;
  for (final b in badges) {
    if (points >= b.threshold) current = b;
  }
  return current;
}

abstract final class PointWeights {
  static const win = 100;
  static const completedLoss = 12;
  static const drawCard = 2;
  static const stackSurvived = 3;
  static const unoCall = 4;
  static const dayPlayed = 25;
}

/// Walkover games record near-zero plays; the same guard as the SQL.
const minPlays = 5;

/// Guests' reduced estimate off the local retention tally.
int pointsFromRetention({required int gamesPlayed, required int gamesWon, required int unoCalls}) {
  final wins = math.max(0, gamesWon);
  final completedLosses = math.max(0, gamesPlayed - gamesWon);
  return wins * PointWeights.win +
      completedLosses * PointWeights.completedLoss +
      math.max(0, unoCalls) * PointWeights.unoCall;
}

class GameContribution {
  const GameContribution({
    required this.won,
    required this.completedLoss,
    required this.cardsPlayedTotal,
    required this.drawCardsPlayed,
    required this.biggestStackSurvived,
    required this.unoCalls,
  });

  final bool won;
  final bool completedLoss;
  final int cardsPlayedTotal;
  final int drawCardsPlayed;
  final int biggestStackSurvived;
  final int unoCalls;
}

int gameContribution(GameContribution g) {
  final real = g.cardsPlayedTotal >= minPlays;
  var p = 0;
  if (g.won && real) {
    p += PointWeights.win;
  } else if (g.completedLoss && real) {
    p += PointWeights.completedLoss;
  }
  p += math.max(0, g.unoCalls) * PointWeights.unoCall;
  p += math.max(0, g.drawCardsPlayed) * PointWeights.drawCard;
  p += math.max(0, g.biggestStackSurvived) * PointWeights.stackSurvived;
  return p;
}

/// Cosmetic badge for a solo bot by ladder rung (1-based); never the apex.
BadgeTier botBadge(int rung) {
  final idx = math.min(math.max(rung, 1), badges.length - 2);
  return badges[idx];
}
