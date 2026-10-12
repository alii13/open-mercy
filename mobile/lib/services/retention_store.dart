// Port of frontend/src/stores/retentionStore.ts: lifetime tallies + the daily
// streak, persisted as 'uno_retention_v1'. Fed once per finished game.

import 'package:flutter/foundation.dart';

import '../engine/seeded_rng.dart';
import 'prefs.dart';

const _storageKey = 'uno_retention_v1';

class GameResult {
  const GameResult({
    required this.won,
    required this.cardsPlayed,
    required this.biggestStackSurvived,
    required this.unoCalls,
    required this.peakHand,
    required this.mode,
  });

  final bool won;
  final int cardsPlayed;
  final int biggestStackSurvived;
  final int unoCalls;
  final int peakHand;

  /// 'sp' or 'mp'
  final String mode;
}

int _daysBetween(String a, String b) {
  final da = DateTime.parse('${a}T00:00:00');
  final db = DateTime.parse('${b}T00:00:00');
  return (db.difference(da).inHours / 24).round();
}

class RetentionStore extends ChangeNotifier {
  RetentionStore._() {
    final j = Prefs.instance.getJson(_storageKey);
    if (j is Map) {
      int n(String k) => (j[k] is num) ? (j[k] as num).toInt() : 0;
      gamesPlayed = n('gamesPlayed');
      gamesWon = n('gamesWon');
      totalCardsPlayed = n('totalCardsPlayed');
      totalUnos = n('totalUnos');
      biggestStackEver = n('biggestStackEver');
      peakHandEver = n('peakHandEver');
      currentStreak = n('currentStreak');
      longestStreak = n('longestStreak');
      lastPlayedDate = j['lastPlayedDate'] is String ? j['lastPlayedDate'] as String : null;
    }
  }

  static RetentionStore? _instance;
  static RetentionStore get instance => _instance ??= RetentionStore._();

  int gamesPlayed = 0;
  int gamesWon = 0;
  int totalCardsPlayed = 0;
  int totalUnos = 0;
  int biggestStackEver = 0;
  int peakHandEver = 0;
  int currentStreak = 0;
  int longestStreak = 0;
  String? lastPlayedDate;

  int get winRate => gamesPlayed == 0 ? 0 : (gamesWon / gamesPlayed * 100).round();

  /// A streak whose last day is older than yesterday is already broken.
  int get effectiveStreak {
    final last = lastPlayedDate;
    if (last == null || currentStreak == 0) return 0;
    if (_daysBetween(last, localDateString()) >= 2) return 0;
    return currentStreak;
  }

  bool get playedToday => lastPlayedDate == localDateString();

  void recordGameResult(GameResult r) {
    gamesPlayed += 1;
    if (r.won) gamesWon += 1;
    totalCardsPlayed += r.cardsPlayed;
    totalUnos += r.unoCalls;
    if (r.biggestStackSurvived > biggestStackEver) biggestStackEver = r.biggestStackSurvived;
    if (r.peakHand > peakHandEver) peakHandEver = r.peakHand;

    // The play counts when a game finishes, so quitting doesn't pad it.
    final today = localDateString();
    final last = lastPlayedDate;
    if (last == null) {
      currentStreak = 1;
    } else {
      final gap = _daysBetween(last, today);
      if (gap == 1) {
        currentStreak += 1;
      } else if (gap != 0) {
        currentStreak = 1;
      }
    }
    lastPlayedDate = today;
    if (currentStreak > longestStreak) longestStreak = currentStreak;
    _save();
  }

  void _save() {
    Prefs.instance.setJson(_storageKey, {
      'gamesPlayed': gamesPlayed,
      'gamesWon': gamesWon,
      'totalCardsPlayed': totalCardsPlayed,
      'totalUnos': totalUnos,
      'biggestStackEver': biggestStackEver,
      'peakHandEver': peakHandEver,
      'currentStreak': currentStreak,
      'longestStreak': longestStreak,
      'lastPlayedDate': lastPlayedDate,
    });
    notifyListeners();
  }
}
