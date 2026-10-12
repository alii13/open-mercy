// Seeded soak: replays 2,000 deterministic games looking for soft-locks.
// Manual tool - run with `flutter test test/soak --run-skipped`. It finds the
// web's own freezes (BUGS.md #4, #5) at the same seeds the web store does.
import 'package:app/engine/types.dart';
import 'package:app/game/game_controller.dart';
import 'package:app/game/local_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../game_controller_test.dart' show autoplay, deal;

void main() {
  testWidgets('seeded soak', skip: true, (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await LocalStore.load();
    final stalls = <String>[];
    for (var i = 0; i < 2000; i++) {
      final c = GameController(store)
        ..initializeGame(const ['You', 'Bot'], mode: StackingMode.values[i % 3], dailySeed: 'soak-$i');
      await deal(tester, c);
      await autoplay(tester, c, maxTicks: 4000);
      if (c.s.gameState != GameState.gameOver) {
        stalls.add('seed soak-$i mode ${c.s.stackingMode.name}: ${c.s.turnState} cur=${c.currentPlayer?.id} '
            'aip=${c.actionInProgress} stack=${c.s.drawStack} hands=${c.players.map((p) => p.hand.length).toList()} '
            'top=${c.topCard}');
      }
      c.dispose();
      await tester.pump(const Duration(seconds: 10));
    }
    // ignore: avoid_print
    print('STALLS ${stalls.length}\n${stalls.join('\n')}');
  });
}
