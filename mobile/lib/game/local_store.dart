// Device-local progress: stacking mode, the bot ladder, and today's daily.
// Mirrors the web's localStorage keys so the meaning of each value is shared,
// though the two devices never see each other's copy.

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../engine/bot.dart';
import '../engine/seeded_rng.dart';
import '../engine/types.dart';

const _stackingKey = 'uno_stacking_mode';
const _ladderKey = 'uno_bot_ladder_v1';
const _dailyKey = 'uno_daily_v1';

enum DailyResult { won, lost, eliminated }

class DailyRecord {
  const DailyRecord({required this.date, required this.result, required this.turns, this.log});

  final String date;
  final DailyResult result;
  final int turns;

  /// One character per human turn: p played, d drew, x ate a stack.
  final String? log;

  Map<String, Object?> toJson() => {'date': date, 'result': result.name, 'turns': turns, 'log': log};

  static DailyRecord? fromJson(Object? json) {
    if (json is! Map) return null;
    final result = DailyResult.values.where((r) => r.name == json['result']);
    if (json['date'] is! String || result.isEmpty || json['turns'] is! int) return null;
    return DailyRecord(
      date: json['date'] as String,
      result: result.first,
      turns: json['turns'] as int,
      log: json['log'] as String?,
    );
  }
}

class LocalStore {
  LocalStore(this._prefs);

  final SharedPreferences _prefs;

  static Future<LocalStore> load() async => LocalStore(await SharedPreferences.getInstance());

  StackingMode get stackingMode {
    final v = _prefs.getString(_stackingKey);
    return StackingMode.values.firstWhere((m) => m.name == v, orElse: () => StackingMode.official);
  }

  Future<void> setStackingMode(StackingMode m) => _prefs.setString(_stackingKey, m.name);

  /// A set of beaten ids rather than a high-water index, so reordering or
  /// inserting a rung later never marks unseen opponents as beaten.
  List<String> get beatenBotIds {
    try {
      final parsed = jsonDecode(_prefs.getString(_ladderKey) ?? '[]');
      return parsed is List ? parsed.whereType<String>().toList() : [];
    } on FormatException {
      return [];
    }
  }

  Future<void> recordBotWin(String botId) {
    final beaten = {...beatenBotIds, botId};
    return _prefs.setString(_ladderKey, jsonEncode(beaten.toList()));
  }

  /// The opponent the Play-vs-bot button should offer.
  BotProfile get nextBot => nextBotFor(beatenBotIds);

  ({int beaten, int total}) get ladderProgress {
    final done = beatenBotIds.toSet();
    return (beaten: botLadder.where((b) => done.contains(b.id)).length, total: botLadder.length);
  }

  /// Today's record, or null if today's deal hasn't been played on this device.
  DailyRecord? get todaysDaily {
    try {
      final rec = DailyRecord.fromJson(jsonDecode(_prefs.getString(_dailyKey) ?? 'null'));
      return rec != null && rec.date == localDateString() ? rec : null;
    } on FormatException {
      return null;
    }
  }

  Future<void> markDailyDone(DailyRecord rec) => _prefs.setString(_dailyKey, jsonEncode(rec.toJson()));
}

/// Pure for testing: the first rung not yet beaten, or the top rung once all are.
BotProfile nextBotFor(List<String> beaten) {
  final done = beaten.toSet();
  return botLadder.firstWhere((b) => !done.contains(b.id), orElse: () => botLadder.last);
}
