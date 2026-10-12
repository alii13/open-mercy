// Every picker must build without throwing - the colour picker once crashed
// on open (a Semantics assertion) and nothing else rendered it.
import 'package:app/engine/types.dart';
import 'package:app/services/prefs.dart';
import 'package:app/ui/game/pickers.dart';
import 'package:app/ui/theme.dart';
import 'package:flutter/material.dart' hide Card;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/app_fonts.dart';

const _wild = Card(id: 'w', color: CardColor.wild, type: CardType.wild);
const _red3 = Card(id: 'r3', color: CardColor.red, type: CardType.number, value: 3);
const _red9 = Card(id: 'r9', color: CardColor.red, type: CardType.number, value: 9);

Future<void> _host(WidgetTester tester, Widget child) async {
  // Pixel 7 logical size, like the device the sheets are checked on.
  tester.view.physicalSize = const Size(412 * 2.625, 915 * 2.625);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.reset);
  await loadAppFonts(tester);
  SharedPreferences.setMockInitialValues({});
  Prefs.wrap(await SharedPreferences.getInstance());
  await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: Scaffold(body: child)));
}

void main() {
  for (final roulette in [false, true]) {
    testWidgets('colour picker (roulette: $roulette) builds and reports the pick', (tester) async {
      CardColor? picked;
      await _host(
        tester,
        ColorPickerPanel(
          title: roulette ? 'ROULETTE TRAP DETECTED' : 'WILD CARD DRAWN',
          subtitle: 'CHOOSE',
          isRoulette: roulette,
          card: roulette ? null : _wild,
          colorCounts: const {CardColor.red: 2, CardColor.blue: 0, CardColor.green: 1, CardColor.yellow: 0},
          onSelect: (c) => picked = c,
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      final err = tester.takeException();
      expect(err, isNull, reason: err is FlutterError ? err.toStringDeep() : '$err');
      expect(find.text('×2'), findsOneWidget);
      await tester.tap(find.text('GREEN'));
      expect(picked, CardColor.green);
    });
  }

  testWidgets('swap sheet returns the player or null for KEEP MY HAND', (tester) async {
    late BuildContext ctx;
    await _host(tester, Builder(builder: (c) { ctx = c; return const SizedBox(); }));
    var result = 'unset';
    showPlayerSelect(ctx, [Player(id: 'p-1', name: 'Pilot', hand: [_red3])]).then((v) => result = '$v');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    expect(find.text('1 cards'), findsOneWidget);
    await tester.tap(find.text('KEEP MY HAND'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(result, 'null');
  });

  testWidgets('discard-all sheet returns the chosen top card', (tester) async {
    late BuildContext ctx;
    await _host(tester, Builder(builder: (c) { ctx = c; return const SizedBox(); }));
    String? result;
    showDiscardAllPicker(ctx, [_red3, _red9]).then((v) => result = v);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    await tester.tap(find.bySemanticsLabel('Pick red number').last);
    await tester.pump(const Duration(milliseconds: 400));
    expect(result, 'r9');
  });

  testWidgets('confirm dialog resolves true on the danger button', (tester) async {
    late BuildContext ctx;
    await _host(tester, Builder(builder: (c) { ctx = c; return const SizedBox(); }));
    bool? result;
    showConfirmDialog(ctx, title: 'Leave the game?', message: 'm', confirmLabel: 'LEAVE', cancelLabel: 'STAY')
        .then((v) => result = v);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('LEAVE'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(result, true);
  });
}
