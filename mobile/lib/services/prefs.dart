// One SharedPreferences handle for the whole app, standing in for the web's
// localStorage. Keys are the same strings the web uses.

import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class Prefs {
  Prefs._(this._p);

  static late Prefs instance;

  final SharedPreferences _p;

  static Future<Prefs> load() async => instance = Prefs._(await SharedPreferences.getInstance());

  /// For tests: wrap an already-loaded instance.
  static Prefs wrap(SharedPreferences p) => instance = Prefs._(p);

  SharedPreferences get raw => _p;

  String? getString(String key) => _p.getString(key);
  Future<void> setString(String key, String value) => _p.setString(key, value);

  /// JSON.parse(localStorage.getItem(key)) with the web's try/catch -> null.
  Object? getJson(String key) {
    final raw = _p.getString(key);
    if (raw == null) return null;
    try {
      return jsonDecode(raw);
    } on FormatException {
      return null;
    }
  }

  Future<void> setJson(String key, Object? value) => _p.setString(key, jsonEncode(value));
}
