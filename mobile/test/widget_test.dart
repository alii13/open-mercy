import 'package:app/game/local_store.dart';
import 'package:app/main.dart';
import 'package:app/services/prefs.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<LocalStore> _boot() async {
  SharedPreferences.setMockInitialValues({});
  Prefs.wrap(await SharedPreferences.getInstance());
  return LocalStore.load();
}

void main() {
  testWidgets('home offers the first ladder bot and the daily', (tester) async {
    await tester.pumpWidget(OpenMercyApp(store: await _boot()));
    expect(find.text('OPEN MERCY'), findsOneWidget);
    expect(find.text('PLAY VS SCRAP'), findsOneWidget);
    expect(find.text("PLAY TODAY'S DEAL"), findsOneWidget);
  });

  testWidgets('a solo game opens the table, deals, and leaves through the confirm', (tester) async {
    await tester.pumpWidget(OpenMercyApp(store: await _boot()));

    await tester.tap(find.text('PLAY VS SCRAP'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('SCRAP'), findsOneWidget);

    // Dealer intro (~1s) + 14 cards at 0.3s each.
    await tester.pump(const Duration(seconds: 6));
    expect(find.text('/25'), findsOneWidget);

    await tester.tap(find.bySemanticsLabel('Leave game'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('LEAVE THE GAME?'), findsOneWidget);
    await tester.tap(find.text('LEAVE'));
    await tester.pump(const Duration(seconds: 2));
    expect(find.text('OPEN MERCY'), findsOneWidget);
    await tester.pump(const Duration(seconds: 15));
  });
}
