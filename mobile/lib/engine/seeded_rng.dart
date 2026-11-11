// Dart port of frontend/src/utils/seededRng.ts. Must stay bit-identical: the
// daily challenge promises the same deal on every device, web included.

import 'types.dart';

int _imul(int a, int b) => ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)).toSigned(32);

/// xmur3 string hash feeding a mulberry32 generator.
Rng seededRng(String seed) {
  var h = (1779033703 ^ seed.length).toSigned(32);
  for (final unit in seed.codeUnits) {
    h = _imul(h ^ unit, 3432918353);
    h = ((h << 13) | ((h & 0xFFFFFFFF) >> 19)).toSigned(32);
  }
  h = (h ^ ((h & 0xFFFFFFFF) >> 16)).toSigned(32);
  var a = h & 0xFFFFFFFF;
  return () {
    a = (a + 0x6D2B79F5).toSigned(32);
    var t = _imul(a ^ ((a & 0xFFFFFFFF) >> 15), 1 | a);
    t = ((t + _imul(t ^ ((t & 0xFFFFFFFF) >> 7), 61 | t)).toSigned(32) ^ t).toSigned(32);
    return ((t ^ ((t & 0xFFFFFFFF) >> 14)) & 0xFFFFFFFF) / 4294967296;
  };
}

/// YYYY-MM-DD in the player's local timezone - the daily challenge day key.
String localDateString([DateTime? d]) {
  final date = d ?? DateTime.now();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${date.year}-${two(date.month)}-${two(date.day)}';
}
