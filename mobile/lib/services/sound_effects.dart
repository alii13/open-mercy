// Port of frontend/src/composables/useSoundEffects.ts. Same five samples,
// same 'uno_sfx_settings_v1' persistence (volume 0.5, unmuted by default).
// The web falls back to oscillator synthesis while a sample is still
// loading or missing; the samples ship inside the app here, so that path
// only covers a failed decode and simply stays silent.

import 'package:flutter/foundation.dart';
import 'package:flutter_soloud/flutter_soloud.dart';

import '../game/game_controller.dart';
import 'prefs.dart';

const _storageKey = 'uno_sfx_settings_v1';

enum Sfx { cardThrow, cardPick, cardLand, cardShuffle, specialCard }

const _files = {
  Sfx.cardThrow: 'assets/audio/sfx/card-throw.ogg',
  Sfx.cardPick: 'assets/audio/sfx/card-pick.ogg',
  Sfx.cardLand: 'assets/audio/sfx/card-land.ogg',
  Sfx.cardShuffle: 'assets/audio/sfx/card-shuffle.ogg',
  Sfx.specialCard: 'assets/audio/sfx/special-card.ogg',
};

/// One shared engine for SFX and music.
class AudioEngine {
  static bool _started = false;
  static bool get ready => _started && SoLoud.instance.isInitialized;

  static Future<void> init() async {
    if (_started) return;
    _started = true;
    try {
      await SoLoud.instance.init();
    } catch (e) {
      debugPrint('audio init failed: $e');
    }
  }
}

class SoundEffects extends ChangeNotifier implements GameSounds {
  SoundEffects._() {
    final json = Prefs.instance.getJson(_storageKey);
    if (json is Map) {
      final v = json['volume'];
      volume = v is num ? v.toDouble().clamp(0.0, 1.0) : 0.5;
      isMuted = json['isMuted'] == true;
    }
  }

  static SoundEffects? _instance;
  static SoundEffects get instance => _instance ??= SoundEffects._();

  double volume = 0.5;
  bool isMuted = false;
  final Map<Sfx, AudioSource> _buffers = {};

  /// Decodes every sample once so play() is instant afterwards.
  Future<void> preload() async {
    await AudioEngine.init();
    if (!AudioEngine.ready) return;
    for (final entry in _files.entries) {
      try {
        _buffers[entry.key] = await SoLoud.instance.loadAsset(entry.value);
      } catch (e) {
        debugPrint('sfx ${entry.key} failed: $e');
      }
    }
  }

  void _play(Sfx name) {
    if (isMuted || !AudioEngine.ready) return;
    final src = _buffers[name];
    if (src == null) return;
    SoLoud.instance.play(src, volume: volume.clamp(0.0, 1.0));
  }

  void playCardThrow() => _play(Sfx.cardThrow);
  @override
  void playCardPick() => _play(Sfx.cardPick);
  @override
  void playCardLand() => _play(Sfx.cardLand);
  @override
  void playCardShuffle() => _play(Sfx.cardShuffle);
  @override
  void playSpecialCard() => _play(Sfx.specialCard);

  void toggleMute() {
    isMuted = !isMuted;
    _save();
  }

  void setVolume(double v) {
    volume = v.clamp(0.0, 1.0);
    _save();
  }

  void _save() {
    Prefs.instance.setJson(_storageKey, {'volume': volume, 'isMuted': isMuted});
    notifyListeners();
  }
}
