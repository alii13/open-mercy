// Port of frontend/src/composables/useMusic.ts: one looped track, its own
// volume + mute persisted as 'uno_music_settings_v1' (volume 0.35 default),
// 1.2s fade in, 0.6s fade out, ducked to 35% for the game-over sting.

import 'package:flutter/widgets.dart';
import 'package:flutter_soloud/flutter_soloud.dart';

import 'prefs.dart';
import 'sound_effects.dart';

const _storageKey = 'uno_music_settings_v1';
const _musicAsset = 'assets/audio/music/loop.mp3';

class Music extends ChangeNotifier {
  Music._() {
    // flutter_soloud keeps playing in the background; a browser tab's audio
    // stops with the page, so pause the loop while the app is hidden.
    _life = AppLifecycleListener(onHide: _pauseForBackground, onShow: _resumeFromBackground);
    final json = Prefs.instance.getJson(_storageKey);
    if (json is Map) {
      final v = json['volume'];
      volume = v is num ? v.toDouble().clamp(0.0, 1.0) : 0.35;
      isMuted = json['isMuted'] == true;
    }
  }

  static Music? _instance;
  static Music get instance => _instance ??= Music._();

  double volume = 0.35;
  bool isMuted = false;
  bool isPlaying = false;
  bool isDucked = false;
  // Held down while a voice channel is live (multiplayer).
  bool isVoiceDucked = false;

  late final AppLifecycleListener _life;
  AudioSource? _source;
  Future<AudioSource>? _loading;
  SoundHandle? _handle;
  // Incremented on stop(); an in-flight start() that sees a newer value was
  // cancelled while loading and must not fade up.
  int _stopGeneration = 0;

  double _effectiveVolume() {
    if (isMuted) return 0;
    final base = isDucked ? volume * 0.35 : volume;
    return isVoiceDucked ? base * 0.4 : base;
  }

  void _fadeTo(double target, int ms) {
    final h = _handle;
    if (h == null || !AudioEngine.ready) return;
    SoLoud.instance.fadeVolume(h, target, Duration(milliseconds: ms));
  }

  Future<void> start() async {
    if (isMuted) return;
    final myGen = _stopGeneration;
    await AudioEngine.init();
    if (!AudioEngine.ready) return;
    try {
      // Shared load, so two overlapping starts (a quick rematch) load once.
      _source ??= await (_loading ??= SoLoud.instance.loadAsset(_musicAsset));
    } catch (e) {
      _loading = null;
      debugPrint('music load failed: $e');
      return;
    }
    if (myGen != _stopGeneration) return;
    final old = _handle;
    if (old != null) await SoLoud.instance.stop(old);
    _handle = SoLoud.instance.play(_source!, volume: 0, looping: true);
    if (myGen != _stopGeneration) {
      await SoLoud.instance.stop(_handle!);
      _handle = null;
      return;
    }
    isPlaying = true;
    _fadeTo(_effectiveVolume(), 1200);
    notifyListeners();
  }

  void stop() {
    _stopGeneration++;
    isPlaying = false;
    // A game that ends ducked must not start the next one ducked.
    isDucked = false;
    final h = _handle;
    _handle = null;
    if (h != null && AudioEngine.ready) {
      SoLoud.instance.fadeVolume(h, 0, const Duration(milliseconds: 600));
      SoLoud.instance.scheduleStop(h, const Duration(milliseconds: 600));
    }
    notifyListeners();
  }

  void _pauseForBackground() {
    final h = _handle;
    if (h != null && AudioEngine.ready) SoLoud.instance.setPause(h, true);
  }

  void _resumeFromBackground() {
    final h = _handle;
    if (h != null && AudioEngine.ready && isPlaying && !isMuted) SoLoud.instance.setPause(h, false);
  }

  @override
  void dispose() {
    _life.dispose();
    super.dispose();
  }

  void duck() {
    isDucked = true;
    _fadeTo(_effectiveVolume(), 250);
  }

  void unduck() {
    isDucked = false;
    _fadeTo(_effectiveVolume(), 400);
  }

  void setVoiceDucking(bool on) {
    if (isVoiceDucked == on) return;
    isVoiceDucked = on;
    _fadeTo(_effectiveVolume(), 400);
  }

  void toggleMute() {
    isMuted = !isMuted;
    _save();
    if (isMuted) {
      _fadeTo(0, 300);
    } else if (isPlaying) {
      if (_handle == null) {
        start();
      } else {
        _fadeTo(_effectiveVolume(), 400);
      }
    }
  }

  void setVolume(double v) {
    volume = v.clamp(0.0, 1.0);
    _save();
    final h = _handle;
    if (h != null && AudioEngine.ready) SoLoud.instance.setVolume(h, _effectiveVolume());
  }

  void _save() {
    Prefs.instance.setJson(_storageKey, {'volume': volume, 'isMuted': isMuted});
    notifyListeners();
  }
}
