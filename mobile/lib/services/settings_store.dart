// Port of frontend/src/stores/settingsStore.ts + useMotion's reduced flag.
// 'uno_settings_v1' holds the motion override; the effective reduced-motion
// state also follows the OS (Android "remove animations" / iOS Reduce Motion).

import 'package:flutter/widgets.dart';

import 'music.dart';
import 'prefs.dart';
import 'sound_effects.dart';

const _storageKey = 'uno_settings_v1';

enum MotionOverride { auto, reduce }

class SettingsStore extends ChangeNotifier with WidgetsBindingObserver {
  SettingsStore._() {
    final json = Prefs.instance.getJson(_storageKey);
    motionOverride = json is Map && json['motionOverride'] == 'reduce' ? MotionOverride.reduce : MotionOverride.auto;
    WidgetsBinding.instance.addObserver(this);
  }

  static SettingsStore? _instance;
  static SettingsStore get instance => _instance ??= SettingsStore._();

  bool isOpen = false;
  late MotionOverride motionOverride;

  bool get osPrefersReduced =>
      WidgetsBinding.instance.platformDispatcher.accessibilityFeatures.disableAnimations;

  bool get reducedMotion => motionOverride == MotionOverride.reduce || osPrefersReduced;

  @override
  void didChangeAccessibilityFeatures() => notifyListeners();

  void open() {
    isOpen = true;
    notifyListeners();
  }

  void close() {
    isOpen = false;
    notifyListeners();
  }

  void toggle() {
    isOpen = !isOpen;
    notifyListeners();
  }

  void setMotionOverride(MotionOverride v) {
    motionOverride = v;
    Prefs.instance.setJson(_storageKey, {'motionOverride': v.name});
    notifyListeners();
  }

  void setSfxVolume(double v) => SoundEffects.instance.setVolume(v);
  void setMusicVolume(double v) => Music.instance.setVolume(v);
  void toggleSfxMute() => SoundEffects.instance.toggleMute();
  void toggleMusicMute() => Music.instance.toggleMute();
}

/// useMotion().reduced
bool get motionReduced => SettingsStore.instance.reducedMotion;
