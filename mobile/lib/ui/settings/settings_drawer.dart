// SettingsDrawer.vue - right-hand drawer (full width on phones): audio,
// motion, help, about.

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/music.dart';
import '../../services/settings_store.dart';
import '../../services/sound_effects.dart';
import '../theme.dart';
import 'rules_modal.dart';

/// The app's navigator, so the drawer can open over whichever screen is up.
final appNavigatorKey = GlobalKey<NavigatorState>();

/// App.vue's always-mounted drawer. SettingsStore.open() (from any screen's
/// gear) pushes the drawer as a see-through route over the current screen:
/// that gives it an Overlay (sliders need one) and a Navigator (HOW TO PLAY
/// opens from it), and lets Android's back key close it like a tap outside.
class SettingsDrawerHost extends StatefulWidget {
  const SettingsDrawerHost({super.key, required this.child});
  final Widget child;

  @override
  State<SettingsDrawerHost> createState() => _SettingsDrawerHostState();
}

class _SettingsDrawerHostState extends State<SettingsDrawerHost> {
  final settings = SettingsStore.instance;
  Route<void>? _route;

  @override
  void initState() {
    super.initState();
    settings.addListener(_sync);
  }

  @override
  void dispose() {
    settings.removeListener(_sync);
    super.dispose();
  }

  void _sync() {
    final nav = appNavigatorKey.currentState;
    if (nav == null) return;
    if (settings.isOpen && _route == null) {
      final route = _route = _drawerRoute();
      nav.push(route).whenComplete(() {
        if (identical(_route, route)) _route = null;
        if (settings.isOpen) settings.close();
      });
    } else if (!settings.isOpen && _route != null) {
      final route = _route!;
      _route = null;
      // Pop when on top so the drawer slides out, as every web close does.
      if (route.isCurrent) {
        nav.pop();
      } else if (route.isActive) {
        nav.removeRoute(route);
      }
    }
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

Route<void> _drawerRoute() => PageRouteBuilder<void>(
  opaque: false,
  barrierDismissible: true,
  barrierLabel: 'Close settings',
  barrierColor: const Color(0x8C000000),
  transitionDuration: motionReduced ? Duration.zero : const Duration(milliseconds: 280),
  reverseTransitionDuration: motionReduced ? Duration.zero : const Duration(milliseconds: 280),
  pageBuilder: (context, a, b) => const _Panel(),
  transitionsBuilder: (context, a, b, child) => SlideTransition(
    position: Tween(
      begin: const Offset(1, 0),
      end: Offset.zero,
    ).animate(CurvedAnimation(parent: a, curve: const Cubic(0.16, 1, 0.3, 1))),
    child: child,
  ),
);

class _Panel extends StatelessWidget {
  const _Panel();

  @override
  Widget build(BuildContext context) {
    final settings = SettingsStore.instance;
    final sfx = SoundEffects.instance;
    final music = Music.instance;
    return Material(
      type: MaterialType.transparency,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF18191B), Color(0xFF0A0A0B)],
          ),
          border: Border(left: BorderSide(color: Color(0x26FFCC00))),
        ),
        child: SafeArea(
          child: ListenableBuilder(
            listenable: Listenable.merge([settings, sfx, music]),
            builder: (context, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: Color(0x0FFFFFFF))),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text('SETTINGS', style: displayText(24, color: OmColors.hazard, ls: 0.18)),
                      ),
                      Semantics(
                        button: true,
                        label: 'Close settings',
                        child: GestureDetector(
                          onTap: settings.close,
                          child: Container(
                            width: 32,
                            height: 32,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              border: Border.all(color: const Color(0x26FFFFFF)),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Icon(LucideIcons.x, size: OmIcon.button, color: OmColors.textPrimary),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                    children: [
                      const _SectionTitle('AUDIO'),
                      _VolumeRow(
                        label: 'SFX',
                        value: sfx.volume,
                        muted: sfx.isMuted,
                        onChanged: settings.setSfxVolume,
                        onToggle: settings.toggleSfxMute,
                      ),
                      _VolumeRow(
                        label: 'MUSIC',
                        value: music.volume,
                        muted: music.isMuted,
                        onChanged: settings.setMusicVolume,
                        onToggle: settings.toggleMusicMute,
                      ),
                      const SizedBox(height: 32),
                      const _SectionTitle('MOTION'),
                      Row(
                        children: [
                          Expanded(
                            child: _Seg(
                              label: 'AUTO',
                              active: settings.motionOverride == MotionOverride.auto,
                              onTap: () => settings.setMotionOverride(MotionOverride.auto),
                            ),
                          ),
                          const SizedBox(width: 6.4),
                          Expanded(
                            child: _Seg(
                              label: 'REDUCED',
                              active: settings.motionOverride == MotionOverride.reduce,
                              onTap: () => settings.setMotionOverride(MotionOverride.reduce),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 9.6),
                      Text(
                        settings.motionOverride == MotionOverride.auto
                            ? settings.osPrefersReduced
                                  ? 'Following your system setting (currently: reduced).'
                                  : 'Following your system setting.'
                            : 'Forced — animations and screen effects disabled.',
                        style: bodyText(11.8, color: OmColors.textMuted, ls: 0.04, height: 1.5),
                      ),
                      const SizedBox(height: 32),
                      const _SectionTitle('HELP'),
                      GestureDetector(
                        onTap: () => showRulesModal(context),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10.4),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            border: Border.all(color: const Color(0x2EFFFFFF)),
                            borderRadius: BorderRadius.circular(3),
                          ),
                          child: Text('HOW TO PLAY', style: bodyText(12, ls: 0.18)),
                        ),
                      ),
                      const SizedBox(height: 32),
                      const _SectionTitle('ABOUT'),
                      Text.rich(
                        TextSpan(
                          style: bodyText(12.5, color: OmColors.textSecondary),
                          children: [
                            const TextSpan(text: 'Built by '),
                            _link('alii13', 'https://github.com/alii13'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 5.6),
                      Text.rich(
                        TextSpan(
                          style: bodyText(11.5, color: OmColors.textMuted),
                          children: [
                            const TextSpan(text: 'Music: '),
                            _link('Kevin MacLeod', 'https://incompetech.com/'),
                            const TextSpan(text: ' · SFX: '),
                            _link('Kenney', 'https://kenney.nl/assets/casino-audio'),
                          ],
                        ),
                      ),
                      const SizedBox(height: 5.6),
                      Text.rich(
                        TextSpan(
                          style: bodyText(11.5, color: OmColors.textMuted),
                          children: [
                            _link('Rules guide', 'https://open-mercy.com/rules/'),
                            const TextSpan(text: ' · '),
                            _link('Source', 'https://github.com/alii13/Uno-no-mercy'),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  InlineSpan _link(String text, String url) => WidgetSpan(
    alignment: PlaceholderAlignment.baseline,
    baseline: TextBaseline.alphabetic,
    child: GestureDetector(
      onTap: () async {
        try {
          await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
        } catch (_) {
          // No browser to open it: nothing useful to show.
        }
      },
      child: Container(
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: Color(0x6600F3FF))),
        ),
        child: Text(text, style: bodyText(12, color: OmColors.neonBlue)),
      ),
    ),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.only(bottom: 6.4),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Color(0x2EFFCC00))),
    ),
    child: Text(
      text,
      style: bodyText(11.5, color: const Color(0xB3FFCC00), ls: 0.35, weight: FontWeight.w500),
    ),
  );
}

class _VolumeRow extends StatelessWidget {
  const _VolumeRow({
    required this.label,
    required this.value,
    required this.muted,
    required this.onChanged,
    required this.onToggle,
  });

  final String label;
  final double value;
  final bool muted;
  final ValueChanged<double> onChanged;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 13.6),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            child: Text(label, style: bodyText(11.5, color: OmColors.textSecondary, ls: 0.22)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Opacity(
              opacity: muted ? 0.4 : 1,
              child: SliderTheme(
                data: SliderTheme.of(context).copyWith(
                  activeTrackColor: OmColors.hazard,
                  thumbColor: OmColors.hazard,
                  inactiveTrackColor: const Color(0x33FFFFFF),
                  overlayShape: SliderComponentShape.noOverlay,
                  // A plain <input type=range>: no step ticks.
                  tickMarkShape: SliderTickMarkShape.noTickMark,
                  trackHeight: 4,
                ),
                child: Slider(value: value, divisions: 20, onChanged: muted ? null : onChanged),
              ),
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: onToggle,
            child: Container(
              width: 60,
              padding: const EdgeInsets.symmetric(vertical: 6.4),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: muted ? const Color(0x14FF2A2A) : null,
                border: Border.all(color: muted ? OmColors.alert : const Color(0x2EFFFFFF)),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(
                muted ? 'OFF' : 'ON',
                style: bodyText(11.2, color: muted ? OmColors.alert : OmColors.textPrimary, ls: 0.18),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Seg extends StatelessWidget {
  const _Seg({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      padding: const EdgeInsets.symmetric(vertical: 8.8),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: active ? OmColors.hazard : null,
        border: Border.all(color: active ? OmColors.hazard : const Color(0x26FFFFFF)),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Text(
        label,
        style: bodyText(
          12.5,
          color: active ? OmColors.bgConcrete : OmColors.textSecondary,
          ls: 0.18,
          weight: active ? FontWeight.w600 : null,
        ),
      ),
    ),
  );
}
