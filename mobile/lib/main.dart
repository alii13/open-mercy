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
  await Prefs.load();
  final store = await LocalStore.load();
  // Decode the SFX once up front (the web fetches them on module init).
  SoundEffects.instance.preload();
  runApp(OpenMercyApp(store: store));
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
