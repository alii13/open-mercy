// Tests render text in the placeholder Ahem font by default, whose metrics
// differ from the bundled fonts. Loading the real ones makes layout tests
// (overflow checks) mean what they say on a device.
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

bool _loaded = false;

Future<void> loadAppFonts(WidgetTester tester) async {
  if (_loaded) return;
  _loaded = true;
  await tester.runAsync(() async {
    Future<void> load(String family, List<String> files) async {
      final l = FontLoader(family);
      for (final f in files) {
        l.addFont(Future.value(ByteData.view(File(f).readAsBytesSync().buffer)));
      }
      await l.load();
    }

    await load('BlackOpsOne', ['assets/fonts/BlackOpsOne-Regular.ttf']);
    await load('ChakraPetch', [
      'assets/fonts/ChakraPetch-Regular.ttf',
      'assets/fonts/ChakraPetch-Medium.ttf',
      'assets/fonts/ChakraPetch-SemiBold.ttf',
      'assets/fonts/ChakraPetch-Bold.ttf',
    ]);
  });
}
