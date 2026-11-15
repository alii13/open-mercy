// The drawer once crashed on open (sliders need an Overlay) and let the
// back key reach the game underneath. Open it from the game, drag a slider,
// open HOW TO PLAY from it, and close it with back.
import 'package:app/game/local_store.dart';
import 'package:app/main.dart';
import 'package:app/services/prefs.dart';
import 'package:app/services/settings_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/app_fonts.dart';

void main() {
  testWidgets('settings drawer over the game: sliders, rules, back closes it', (tester) async {
    tester.view.physicalSize = const Size(412 * 2.625, 915 * 2.625);
    tester.view.devicePixelRatio = 2.625;
    addTearDown(tester.view.reset);
    await loadAppFonts(tester);
    SharedPreferences.setMockInitialValues({});
    Prefs.wrap(await SharedPreferences.getInstance());
    final store = await LocalStore.load();
    await tester.pumpWidget(OpenMercyApp(store: store));

    await tester.tap(find.text('PLAY VS SCRAP'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 6));

    await tester.tap(find.bySemanticsLabel('Settings'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    expect(find.text('SETTINGS'), findsOneWidget);

    await tester.drag(find.byType(Slider).first, const Offset(-60, 0));
    await tester.pump();
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('HOW TO PLAY'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('GOT IT'), findsOneWidget);
    await tester.tap(find.text('GOT IT'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));

    // Android back closes the drawer - not the leave-game confirm.
    await tester.binding.handlePopRoute();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('SETTINGS'), findsNothing);
    expect(find.text('LEAVE THE GAME?'), findsNothing);
    expect(SettingsStore.instance.isOpen, false);
    expect(find.textContaining('/25'), findsWidgets);

    await tester.pump(const Duration(seconds: 15));
  });
}
