import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../engine/bot.dart';
import '../../engine/seeded_rng.dart';
import '../../services/sound_effects.dart';
import '../settings/rules_modal.dart';
import '../../engine/types.dart';
import '../../game/game_controller.dart';
import '../../game/local_store.dart';
import '../theme.dart';
import 'game_screen.dart';

const _modeBlurb = {
  StackingMode.official: 'Stack a draw only on an equal or higher value.',
  StackingMode.house: 'Wild draws stack on anything; coloured draws stay strict.',
  StackingMode.casual: 'Anything goes - any draw stacks on any draw.',
};

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.store});

  final LocalStore store;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late StackingMode _mode = widget.store.stackingMode;
  late BotProfile _opponent = widget.store.nextBot;

  bool _starting = false;

  Future<void> _play({bool daily = false}) async {
    // A second tap before the route covers the button would push a 2nd game.
    if (_starting) return;
    _starting = true;
    final controller = GameController(widget.store, sounds: SoundEffects.instance);
    // App.vue startLocalGame / startDailyGame.
    if (daily) {
      controller.initializeGame(const ['You', 'Terminator'], mode: StackingMode.official, dailySeed: localDateString());
    } else {
      controller.initializeGame(['You', _opponent.name], mode: _mode, botIds: [_opponent.id]);
    }
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => GameScreen(controller: controller, store: widget.store)),
    );
    _starting = false;
    if (!mounted) return;
    // A win may have unlocked the next rung.
    setState(() => _opponent = widget.store.nextBot);
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final beaten = store.beatenBotIds.toSet();
    final progress = store.ladderProgress;
    final daily = store.todaysDaily;

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(OmSpace.s4),
          children: [
            const SizedBox(height: OmSpace.s6),
            Text('OPEN MERCY', textAlign: TextAlign.center, style: displayStyle(40, color: OmColors.hazard, letterSpacing: 3)),
            const SizedBox(height: OmSpace.s2),
            const Text(
              'No Mercy rules. Hold 25 cards and you are out.',
              textAlign: TextAlign.center,
              style: TextStyle(color: OmColors.textSecondary, fontSize: 14),
            ),
            const SizedBox(height: OmSpace.s8),

            // --- Practice vs the bot ladder (primary create action: alert red)
            _Panel(
              children: [
                Row(
                  children: [
                    const Text('BOT LADDER', style: labelStyle),
                    const Spacer(),
                    Text(
                      '${progress.beaten} / ${progress.total} beaten',
                      style: const TextStyle(color: OmColors.textSecondary, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: OmSpace.s3),
                Wrap(
                  spacing: OmSpace.s2,
                  runSpacing: OmSpace.s2,
                  children: [
                    for (final (i, bot) in botLadder.indexed)
                      _RungChip(
                        bot: bot,
                        rung: i + 1,
                        beaten: beaten.contains(bot.id),
                        // Unlocked through the first rung not yet beaten.
                        locked: botLadder.take(i).any((b) => !beaten.contains(b.id)),
                        selected: bot.id == _opponent.id,
                        onTap: () => setState(() => _opponent = bot),
                      ),
                  ],
                ),
                const SizedBox(height: OmSpace.s4),
                const Text('STACKING', style: labelStyle),
                const SizedBox(height: OmSpace.s2),
                SegmentedButton<StackingMode>(
                  segments: [
                    for (final m in StackingMode.values)
                      ButtonSegment(value: m, label: Text(m.name.toUpperCase(), style: const TextStyle(fontSize: 12))),
                  ],
                  selected: {_mode},
                  showSelectedIcon: false,
                  onSelectionChanged: (v) {
                    setState(() => _mode = v.first);
                    store.setStackingMode(v.first);
                  },
                  style: SegmentedButton.styleFrom(
                    selectedBackgroundColor: OmColors.surfaceMetal,
                    selectedForegroundColor: OmColors.hazard,
                    foregroundColor: OmColors.textSecondary,
                    side: const BorderSide(color: Color(0x33FFFFFF)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                ),
                const SizedBox(height: OmSpace.s2),
                Text(_modeBlurb[_mode]!, style: const TextStyle(color: OmColors.textMuted, fontSize: 12)),
                const SizedBox(height: OmSpace.s4),
                FilledButton.icon(
                  onPressed: _play,
                  icon: const Icon(LucideIcons.play, size: OmIcon.button),
                  label: Text('PLAY VS ${_opponent.name.toUpperCase()}', style: displayStyle(16, color: Colors.white)),
                  style: FilledButton.styleFrom(
                    backgroundColor: OmColors.alert,
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: OmSpace.s4),

            // --- Daily challenge (hazard yellow)
            _Panel(
              borderColor: OmColors.hazard.withValues(alpha: 0.5),
              children: [
                const Row(
                  children: [
                    Icon(LucideIcons.calendar, size: OmIcon.inline, color: OmColors.hazard),
                    SizedBox(width: OmSpace.s2),
                    Text('DAILY CHALLENGE', style: TextStyle(fontSize: 11, letterSpacing: 2.6, fontWeight: FontWeight.w600, color: OmColors.hazard)),
                  ],
                ),
                const SizedBox(height: OmSpace.s2),
                const Text(
                  'One deal, the same for everyone today, against Terminator. One attempt.',
                  style: TextStyle(color: OmColors.textSecondary, fontSize: 13),
                ),
                const SizedBox(height: OmSpace.s3),
                if (daily != null)
                  _DailyResult(record: daily)
                else
                  OutlinedButton.icon(
                    onPressed: () => _play(daily: true),
                    icon: const Icon(LucideIcons.swords, size: OmIcon.button),
                    label: const Text("PLAY TODAY'S DEAL"),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: OmColors.hazard,
                      side: const BorderSide(color: OmColors.hazard),
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: OmSpace.s4),

            // --- Meta (neutral)
            TextButton.icon(
              onPressed: () => showRulesModal(context),
              icon: const Icon(LucideIcons.bookOpen, size: OmIcon.button),
              label: const Text('HOW TO PLAY'),
              style: TextButton.styleFrom(foregroundColor: OmColors.textSecondary, minimumSize: const Size.fromHeight(44)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.children, this.borderColor = const Color(0x1FFFFFFF)});

  final List<Widget> children;
  final Color borderColor;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(OmSpace.s4),
        decoration: BoxDecoration(
          color: OmColors.surfaceMetalDark,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: borderColor),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      );
}

class _RungChip extends StatelessWidget {
  const _RungChip({
    required this.bot,
    required this.rung,
    required this.beaten,
    required this.locked,
    required this.selected,
    required this.onTap,
  });

  final BotProfile bot;
  final int rung;
  final bool beaten;
  final bool locked;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fg = locked ? OmColors.textMuted : (selected ? OmColors.alert : OmColors.textPrimary);
    return InkWell(
      onTap: locked ? null : onTap,
      borderRadius: BorderRadius.circular(4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: OmSpace.s3, vertical: OmSpace.s2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(4),
          color: selected ? OmColors.alert.withValues(alpha: 0.12) : const Color(0x0DFFFFFF),
          border: Border.all(color: selected ? OmColors.alert : const Color(0x24FFFFFF)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (locked)
              const Icon(LucideIcons.lock, size: OmIcon.inline, color: OmColors.textMuted)
            else if (beaten)
              const Icon(LucideIcons.check, size: OmIcon.inline, color: OmColors.neonGreen)
            else
              Text('$rung', style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
            const SizedBox(width: OmSpace.s1),
            Text(bot.name, style: TextStyle(color: fg, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _DailyResult extends StatelessWidget {
  const _DailyResult({required this.record});

  final DailyRecord record;

  @override
  Widget build(BuildContext context) {
    final (text, color) = switch (record.result) {
      DailyResult.won => ('Cleared in ${record.turns} turns', OmColors.neonGreen),
      DailyResult.eliminated => ('Mercy got you today', OmColors.alert),
      DailyResult.lost => ('Lost today - back tomorrow', OmColors.textSecondary),
    };
    return Row(
      children: [
        Icon(record.result == DailyResult.won ? LucideIcons.trophy : LucideIcons.clock, size: OmIcon.button, color: color),
        const SizedBox(width: OmSpace.s2),
        Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// Interim helpers: this screen is replaced by the MultiplayerLobby.vue port.
TextStyle displayStyle(double size, {Color color = OmColors.textPrimary, double letterSpacing = 1.5}) =>
    TextStyle(fontFamily: fontDisplay, fontSize: size, color: color, letterSpacing: letterSpacing);

const labelStyle = TextStyle(fontSize: 11, letterSpacing: 2.6, fontWeight: FontWeight.w600, color: OmColors.neonBlue);
