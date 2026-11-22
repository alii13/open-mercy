// Regressions from the PR #193 review.
import 'package:app/engine/types.dart';
import 'package:app/services/prefs.dart';
import 'package:app/ui/fx/fx_overlay.dart';
import 'package:app/ui/game/hand_fan.dart';
import 'package:app/ui/theme.dart';
import 'package:flutter/material.dart' hide Card;
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _wild = Card(id: 'w', color: CardColor.wild, type: CardType.draw6);

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(412 * 2.625, 915 * 2.625);
  tester.view.devicePixelRatio = 2.625;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  Prefs.wrap(await SharedPreferences.getInstance());
}

void main() {
  // A power card's impact used to run inside FxOverlay.build and add new
  // transients to the list build was iterating (ConcurrentModificationError).
  testWidgets('a power-card impact can spawn more effects mid-flight', (tester) async {
    await _phone(tester);
    final fx = GlobalKey<FxOverlayState>();
    await tester.pumpWidget(MaterialApp(theme: buildTheme(), home: Scaffold(body: FxOverlay(key: fx))));
    var impacts = 0;
    for (final throwIt in [
      () => fx.currentState!.throwFromHand(_wild, const Rect.fromLTWH(150, 700, 78, 109), const Rect.fromLTWH(220, 400, 99, 129),
          onImpact: () {
            impacts++;
            fx.currentState!
              ..edgeFlash(CardColor.red)
              ..pileFlash(const Rect.fromLTWH(220, 400, 99, 129), CardColor.red)
              ..shockwave(const Offset(270, 465), CardColor.red);
          }),
      () => fx.currentState!.opponentThrow(_wild, const Rect.fromLTWH(20, 40, 160, 44), const Rect.fromLTWH(220, 400, 99, 129),
          onImpact: () {
            impacts++;
            fx.currentState!.edgeFlash(CardColor.blue);
          }),
    ]) {
      throwIt();
      for (var i = 0; i < 50; i++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(tester.takeException(), isNull);
    }
    expect(impacts, 2);
    await tester.pump(const Duration(seconds: 2));
  });

  // The lifted preview floats above the hand band; it used to sit outside the
  // HandFan's hit-test bounds, so tapping it did nothing.
  testWidgets('long-press, release, then tap the lifted card plays it', (tester) async {
    await _phone(tester);
    final hand = [
      const Card(id: 'a', color: CardColor.red, type: CardType.number, value: 1),
      const Card(id: 'b', color: CardColor.red, type: CardType.number, value: 2),
      const Card(id: 'c', color: CardColor.red, type: CardType.number, value: 3),
    ];
    Card? played;
    await tester.pumpWidget(MaterialApp(
      theme: buildTheme(),
      home: Scaffold(
        body: Column(children: [
          const Expanded(child: SizedBox()),
          SizedBox(
            height: 200,
            child: HandFan(cards: hand, isMyTurn: true, canPlay: (_) => true, onPlay: (c, _) => played = c),
          ),
        ]),
      ),
    ));
    await tester.pump();

    final g = await tester.startGesture(tester.getCenter(find.bySemanticsLabel('Red 2, playable')));
    await tester.pump(const Duration(milliseconds: 400)); // past the 280ms hold
    await g.up();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('TAP TO PLAY'), findsOneWidget);
    expect(played, isNull);

    // Tap the lifted card face - well above the hand band.
    final pill = tester.getCenter(find.text('TAP TO PLAY'));
    await tester.tapAt(pill - const Offset(0, 120));
    await tester.pump();
    expect(played?.id, 'b');
  });
}
