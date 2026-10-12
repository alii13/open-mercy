import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'game/local_store.dart';
import 'services/prefs.dart';
import 'services/sound_effects.dart';
import 'ui/screens/home_screen.dart';
import 'ui/settings/settings_drawer.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The table is laid out for a phone held upright.
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  _registerFontLicences();
  await Prefs.load();
  final store = await LocalStore.load();
  // Decode the SFX once up front (the web fetches them on module init).
  SoundEffects.instance.preload();
  runApp(OpenMercyApp(store: store));
}

/// The bundled OFL fonts ship their licence text (shown in the platform's
/// licence page alongside the packages').
void _registerFontLicences() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(
      const ['Black Ops One'],
      await rootBundle.loadString('assets/fonts/OFL-BlackOpsOne.txt'),
    );
    yield LicenseEntryWithLineBreaks(
      const ['Chakra Petch'],
      await rootBundle.loadString('assets/fonts/OFL-ChakraPetch.txt'),
    );
  });
}

class OpenMercyApp extends StatelessWidget {
  const OpenMercyApp({super.key, required this.store});

  final LocalStore store;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Open Mercy',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      navigatorKey: appNavigatorKey,
      // App.vue keeps the settings drawer mounted over every screen.
      builder: (context, child) => SettingsDrawerHost(child: child ?? const SizedBox.shrink()),
      home: HomeScreen(store: store),
    );
  }
}
