<template>
  <div class="lobby-container">
    <!-- Top bar — slim, brand left, identity + auth controls right. No scan-line. -->
    <header v-if="!(atTable && loungeLoaded)" class="lobby-top-bar" :class="{ 'menu-open': accountOpen }">
      <a class="brand-mark" href="#" @click.prevent>
        <span class="brand-mark-uno">OPEN</span>
        <span class="brand-mark-nomercy">MERCY</span>
      </a>

      <div class="top-bar-cta">
        <WhatsNew ref="whatsNewRef" class="bar-whatsnew" />
        <!-- One account surface for guests and signed-in users alike: the name
             is the control, and everything about "you" hangs off it. Stats used
             to need its own header slot; nesting it here costs no width, which
             matters most on a phone. -->
        <div class="account" ref="accountRef">
          <!-- Phones: one burger holds everything about "you", so the bar
               never wraps to a second row. The dot is What's new, unread. -->
          <button
            class="menu-burger"
            aria-haspopup="menu"
            :aria-expanded="accountOpen"
            :aria-label="burgerLabel"
            @click="accountOpen = !accountOpen"
          >
            <X v-if="accountOpen" :size="20" :stroke-width="2" aria-hidden="true" />
            <MenuIcon v-else :size="20" :stroke-width="2" aria-hidden="true" />
            <span v-if="(whatsNewUnread || social.incoming.length) && !accountOpen" class="burger-dot" aria-hidden="true" />
          </button>
          <button
            class="username-chip username-chip-editable"
            aria-haspopup="menu"
            :aria-expanded="accountOpen"
            @click="accountOpen = !accountOpen"
          >
            <Avatar :uid="authStore.user?.id" :name="authStore.username" :size="22" class="chip-avatar" />
            <span class="chip-name">{{ authStore.username }}</span>
            <span v-if="social.incoming.length" class="chip-badge" :title="`${social.incoming.length} friend request${social.incoming.length > 1 ? 's' : ''}`">{{ social.incoming.length }}</span>
            <ChevronDown class="chip-edit-icon" :stroke-width="2" aria-hidden="true" />
          </button>
          <div v-if="accountOpen" class="menu-scrim" aria-hidden="true" @click="closeAccount" />
          <div v-if="accountOpen" class="account-menu" role="menu">
            <div class="menu-phone menu-who" role="none">
              <Avatar :uid="authStore.user?.id" :name="authStore.username" :size="36" />
              <span class="menu-who-text">
                <span class="menu-who-name">{{ authStore.username }}</span>
                <span class="menu-who-kind">{{ authStore.isAnonymous ? 'Guest · progress lives on this device' : 'Signed in' }}</span>
              </span>
            </div>
            <button v-if="authStore.isAnonymous" class="menu-phone menu-claim" role="menuitem" @click="claimFromMenu">
              {{ authStore.claimPending ? 'CONFIRM YOUR EMAIL' : 'CLAIM ACCOUNT' }}
            </button>
            <!-- .stop: What's new closes on any window click outside itself,
                 and this tap would otherwise close it as it opens. -->
            <button class="menu-phone account-item account-item--first" role="menuitem" @click.stop="openWhatsNewFromMenu">
              What's new
              <span v-if="whatsNewUnread" class="menu-new">{{ whatsNewUnread }} NEW</span>
            </button>
            <button v-if="authStore.profile?.share_code" class="account-item" role="menuitem" @click="viewProfile">View profile</button>
            <!-- Name, photo, friends, email and deleting live in the account modal. -->
            <button class="account-item" role="menuitem" @click="accountFromMenu">
              Account
              <span v-if="social.incoming.length" class="account-count">{{ social.incoming.length }}</span>
            </button>
            <button class="account-item account-item--out" role="menuitem" @click="signOutFromMenu">Sign out</button>
          </div>
        </div>
        <!-- Stays in the bar rather than the menu on wide screens: it is the
             conversion CTA. Phones move it to the top of the burger menu, as a
             button, so the bar fits one row. -->
        <button
          v-if="authStore.isAnonymous"
          class="text-link upgrade-link"
          @click="upgradeAccount"
        >
          {{ authStore.claimPending ? 'CONFIRM YOUR EMAIL' : 'CLAIM ACCOUNT' }}
        </button>
      </div>
    </header>

    <div class="lobby-content" :class="{ 'lobby-content--top': !mpStore.currentGame }">
      <!-- Dead invite/room code: rooms close when everyone leaves, so a stale
           link can never succeed — offer escape hatches instead of a retry trap. -->
      <div v-if="roomEnded" class="room-ended-card" role="alert">
        <h2 class="room-ended-title">THIS ROOM HAS ENDED</h2>
        <p class="room-ended-sub">Rooms close when everyone leaves. Start a fresh one or jump into a live match.</p>
        <div class="room-ended-actions">
          <Button variant="primary" size="md" block :disabled="mpStore.loading" @click="handleCreateGame">
            {{ mpStore.loading ? 'CREATING...' : 'CREATE A NEW ROOM' }}
          </Button>
          <Button variant="secondary" size="md" block :disabled="mpStore.loading" @click="handleTakeSeat">
            JOIN A PUBLIC TABLE
          </Button>
        </div>
      </div>
      <div v-else-if="friendlyError" class="error-banner">
        {{ friendlyError }}
      </div>

      <!-- No active game — focused entry view with one primary CTA -->
      <div v-if="!mpStore.currentGame" class="lobby-entry">
        <h1 class="entry-heading">HOW DO YOU WANT TO PLAY?</h1>

        <!-- The daily loop: the deal is the reason to play today, the board is
             the reason to come back tomorrow. Deliberately flat siblings
             rather than per-column wrappers — the desktop grid places each
             card into a shared row, and that shared row is what lines the card
             borders up across both columns. -->
        <div class="daily-card" :class="{ done: !!dailyRecord }">
          <div class="daily-head">
            <span class="daily-title">TODAY'S DEAL</span>
            <span class="daily-date">{{ dailyDateLabel }}</span>
          </div>
          <div
            v-if="retention.effectiveStreak > 0"
            class="streak-chip"
            :class="{ 'at-risk': !retention.playedToday }"
            role="status"
          >
            <Flame class="streak-flame" :stroke-width="2" aria-hidden="true" />
            <span class="streak-count">{{ retention.effectiveStreak }}-day streak</span>
            <span v-if="retention.shieldHolding" class="streak-state streak-state--warn">
              <Shield :size="14" :stroke-width="2" aria-hidden="true" />
              Your shield is holding it. Play today
            </span>
            <span v-else-if="!retention.playedToday" class="streak-state streak-state--warn">Play today to keep it</span>
            <span v-else-if="retention.shieldReady && retention.effectiveStreak >= 2" class="streak-state" title="Covers one missed day, once a week">
              <Shield :size="14" :stroke-width="2" aria-hidden="true" />
              Shield ready
            </span>
          </div>
          <template v-if="!dailyRecord">
            <p class="daily-desc">The same shuffle for every player in the world. One scored attempt.</p>
            <Button variant="secondary" size="md" block class="daily-play" @click="$emit('playDaily')">
              {{ dailyInProgress ? 'CONTINUE' : 'PLAY' }}
            </Button>
          </template>
          <template v-else>
            <p class="daily-desc daily-result">
              {{ dailyRecord.result === 'won' ? `Cleared in ${dailyRecord.turns} turns` : dailyRecord.result === 'eliminated' ? 'Mercy got you today' : 'Lost today' }}
              <span v-if="dailyPercentile">- top {{ dailyPercentile }}% today.</span>
              <span v-else>- new deal tomorrow.</span>
            </p>

            <!-- The run, drawn. Absent when the record came from the server:
                 the turn log only ever lived on the device that played. -->
            <div v-if="dailyCells.length" class="daily-run" aria-hidden="true">
              <span
                v-for="(cell, i) in dailyCells"
                :key="i"
                class="run-cell"
                :class="`run-cell--${cell}`"
              />
            </div>
            <p v-else class="daily-elsewhere">Played on another device — the run isn't stored here.</p>

            <div v-if="dailyCells.length" class="daily-legend">
              <span class="legend-item"><Check :size="14" :stroke-width="2" /> played</span>
              <span class="legend-item"><Minus :size="14" :stroke-width="2" /> drew</span>
              <span class="legend-item"><Skull :size="14" :stroke-width="2" /> stacked on</span>
            </div>

            <Button variant="ghost" size="sm" block :disabled="sharingDaily" @click="onShareDaily">
              {{ dailyShareLabel }}
            </Button>
          </template>
        </div>

        <!-- Feature-detected the same way the leaderboard link always was:
             absent until the definer SQL is installed. -->
        <div v-if="lb.available.value" class="board-card">
          <div class="board-head">
            <span class="board-title">Today's top</span>
            <span v-if="dailyPlayerCount" class="board-count">{{ dailyPlayerCount }} played</span>
          </div>
          <ol v-if="lb.daily.value.length" class="board-list">
            <li
              v-for="row in lb.daily.value.slice(0, 5)"
              :key="row.rank"
              class="board-row"
              :class="{ mine: row.is_me }"
            >
              <span class="board-rank">{{ row.rank }}</span>
              <Avatar
                :uid="row.user_id"
                :name="row.username"
                :size="24"
                :badge="dailyBadgeFor(row)?.badge"
                :points="dailyBadgeFor(row)?.points"
                :progress="dailyBadgeFor(row)?.progress"
                :presence="row.user_id ? presence[row.user_id] ?? null : undefined"
                badge-link
                class="board-badge"
              />
              <!-- share_code only exists once the v2 SQL is installed, so the
                   name falls back to plain text rather than a dead button. -->
              <component
                :is="row.share_code ? 'button' : 'span'"
                class="board-name"
                :class="{ clickable: !!row.share_code }"
                @click="openProfile(row)"
              >
                {{ row.username }}
              </component>
              <span v-if="flagEmoji(row.country)" class="board-flag" :title="row.country ?? ''">{{ flagEmoji(row.country) }}</span>
              <span
                class="board-metric"
                :class="row.result === 'won' ? 'board-metric--won' : 'board-metric--out'"
              >
                {{ row.result === 'won' ? `${row.effort} moves` : row.result === 'eliminated' ? 'Eliminated' : 'Lost' }}
              </span>
            </li>
          </ol>
          <p v-else class="board-empty">No scores yet today. Be the first on the board.</p>
          <p v-if="myDailyRank" class="board-mine">{{ myDailyRank }}</p>
          <button class="lb-link" @click="openLeaderboard">Full leaderboard <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" /></button>
        </div>

        <!-- Play with friends: a private room with a code. The rules choice
             lives inside the same card, above the button that consumes it.
             Flat children on purpose: a phone stacks them in this order, a
             wide screen moves the picker up beside the eyebrow. -->
        <div class="create-card">
          <span class="create-eyebrow">PLAY WITH FRIENDS</span>
          <p class="create-note">A private room with a code to share. It starts when you say.</p>
          <div class="mode-pills">
            <button
              v-for="m in stackingModes"
              :key="m.value"
              class="mode-pill"
              :class="{ active: selectedStackingMode === m.value }"
              @click="selectedStackingMode = m.value"
            >
              {{ m.label }}
            </button>
          </div>
          <p class="mode-desc">{{ currentModeDesc }}</p>
          <Button
            variant="primary"
            size="md"
            block
            class="create-btn"
            :disabled="mpStore.loading"
            @click="handleCreateGame"
          >
            {{ mpStore.loading ? 'CREATING...' : 'CREATE A ROOM' }}
          </Button>
        </div>

        <PublicTableCard
          class="public-table"
          :view="tableView"
          :online="{ show: online.show.value, count: online.count.value }"
          :loading="mpStore.loading"
          @take-seat="handleTakeSeat"
        />

        <!-- Other ways in: a friend's code, or the bot ladder. -->
        <div class="mode-list" role="group" aria-label="Other ways to play">
          <button class="mode-item" @click="showJoinModal = true">
            <span class="mode-glyph mode-glyph--cyan"><Hash :size="16" :stroke-width="2" aria-hidden="true" /></span>
            <span class="mode-text">
              <span class="mode-name">Join with code</span>
              <span class="mode-hint">Enter a friend's six-character room code</span>
            </span>
            <ChevronRight class="mode-chev" :size="16" aria-hidden="true" />
          </button>
          <button class="mode-item" @click="$emit('playLocal', selectedStackingMode)">
            <span class="mode-glyph mode-glyph--dim"><Bot :size="16" :stroke-width="2" aria-hidden="true" /></span>
            <span class="mode-text">
              <span class="mode-name">Play vs bot</span>
              <span class="mode-hint">
                {{ ladderHint }}
                <span class="mode-help" role="img" :aria-label="LADDER_EXPLAINER">
                  <HelpCircle :size="14" :stroke-width="2" />
                  <!-- aria-hidden: the concise aria-label above is what gets
                       read, or the whole panel would be appended to the row's
                       accessible name. -->
                  <span class="mode-tip" aria-hidden="true">
                    <strong class="mode-tip-title">The ladder</strong>
                    Eight opponents, easiest to hardest. Each plays its own way -
                    Vera hoards wilds, Kobra stacks every draw she holds. Beat one
                    to unlock the next.
                  </span>
                </span>
              </span>
            </span>
          </button>
        </div>

        <!-- Guest investment hook: streaks and scores die with the guest
             session — the moment they have something to lose is the moment
             an account makes sense. -->
        <button
          v-if="authStore.isAnonymous && (retention.effectiveStreak > 1 || dailyRecord)"
          class="streak-keep-link"
          @click="upgradeAccount"
        >
          Your streak and scores live on this guest session - create an account to keep them
        </button>
      </div>

      <!-- A public room waits at the 3D table; private rooms, and any browser
           that cannot draw it, keep the list below. -->
      <PublicTableLounge
        v-else-if="atTable"
        @fallback="loungeFailed = true"
        @leave="showLeaveConfirm = true"
      />

      <!-- Waiting room — after creating, before starting -->
      <div v-else-if="mpStore.gameStatus === 'waiting'" class="waiting-room">
        <!-- Joined right as a game here ended: no seat in that game, so the
             room reads as its waiting room and the next deal includes us. -->
        <p v-if="mpStore.ghostInFinishedGame" class="just-ended-note">
          A game just ended here - you're in for the next one.
        </p>
        <div class="room-code-card">
          <span class="room-code-label">ROOM CODE</span>
          <span class="room-code-value">{{ mpStore.roomCode }}</span>
          <div class="room-code-actions">
            <!-- The one invite affordance: the native share sheet where it
                 exists (phones), the clipboard elsewhere. -->
            <button class="code-action-btn" @click="shareInvite">
              <Check v-if="copied" class="code-action-icon" :stroke-width="2" aria-hidden="true" />
              <Share2 v-else-if="canNativeShare" class="code-action-icon" :stroke-width="2" aria-hidden="true" />
              <Copy v-else class="code-action-icon" :stroke-width="2" aria-hidden="true" />
              {{ copied ? 'LINK COPIED' : canNativeShare ? 'SHARE LINK' : 'COPY LINK' }}
            </button>
          </div>
          <!-- Same content, structured: the rule set is card metadata, so it
               reads as a hairline-separated footer instead of floating in the
               same stack as the code and its action. -->
          <div class="room-mode-footer">
            <span class="room-mode-tag">{{ modeLabel(mpStore.stackingMode) }} RULES</span>
            <p class="room-mode-desc">{{ modeDesc(mpStore.stackingMode) }}</p>
          </div>
        </div>

        <!-- The table: who is here, who is missing, and when it deals - one
             surface, cyan-zoned like every multiplayer element. -->
        <section class="table-card">
          <div class="table-head">
            <span class="table-label">AT THE TABLE</span>
            <!-- Connected players, matching the solo CTA and the server's
                 own start gate - roster ghosts are seats, not people. -->
            <span class="table-count">{{ mpStore.presentUserIds.length }}<span class="table-count-cap"> / 20</span></span>
          </div>

          <div class="players-list">
            <div
              v-for="player in mpStore.gamePlayers"
              :key="player.id"
              class="player-chip"
            >
              <!-- Photo (or initial) with the tier shield as its pip, same
                   contract as the in-game seats. -->
              <div class="seat-avatar-wrap">
                <Avatar
                  :uid="player.user_id"
                  :name="player.name ?? ''"
                  :size="32"
                  :badge="seatBadges[player.user_id]?.badge"
                  :points="seatBadges[player.user_id]?.points"
                  :progress="seatBadges[player.user_id]?.progress"
                  badge-link
                />
                <span
                  class="presence-dot"
                  :class="{ connected: isPlayerConnected(player.user_id) }"
                  :title="isPlayerConnected(player.user_id) ? 'Connected' : 'Connecting…'"
                ></span>
              </div>
              <!-- My own seat is renamable; others render plain. -->
              <div
                v-if="player.user_id === authStore.user?.id && editingName && editTarget === 'room'"
                class="name-edit"
              >
                <input
                  v-model="nameInput"
                  :ref="(el: any) => el && el.focus && el.focus()"
                  class="username-edit-input seat-edit-input"
                  :class="{ 'has-error': nameError }"
                  maxlength="20"
                  aria-label="Edit nickname"
                  :aria-invalid="!!nameError"
                  aria-describedby="name-error-room"
                  @input="nameError = ''; nameSuggestions = []"
                  @keyup.enter="saveName"
                  @keyup.esc="closeNameEdit"
                  @blur="onNameBlur"
                />
                <p v-if="nameError" id="name-error-room" class="name-error" role="alert">{{ nameError }}</p>
          <div v-if="nameSuggestions.length" class="name-suggestions">
            <span class="name-suggestions-label">Free:</span>
            <button
              v-for="s in nameSuggestions"
              :key="s"
              type="button"
              class="name-suggestion"
              @mousedown.prevent
              @click="applySuggestion(s)"
            >{{ s }}</button>
          </div>
              </div>
              <button
                v-else-if="player.user_id === authStore.user?.id"
                class="player-name player-name-editable"
                title="Tap to rename"
                @click="startEditName('room')"
              >
                {{ player.name }}
                <Pencil class="seat-edit-icon" :stroke-width="2" aria-hidden="true" />
              </button>
              <span v-else class="player-name">{{ player.name }}</span>
              <span
                v-if="voiceStore.voiceUserIds.has(player.user_id)"
                class="voice-dot"
                :class="{ speaking: voiceStore.speakingUserIds.has(player.user_id) }"
                title="In voice"
              ></span>
              <button
                v-if="canVoiceMute(player.user_id)"
                class="seat-voice-btn"
                :class="{ 'is-muted': voiceStore.localMutedUserIds.has(player.user_id) }"
                :title="voiceMuteTitle(player.user_id)"
                :aria-label="voiceMuteTitle(player.user_id)"
                @click="handleVoiceMute(player.user_id)"
              >
                <VolumeX v-if="voiceStore.localMutedUserIds.has(player.user_id)" :size="14" :stroke-width="2" aria-hidden="true" />
                <Volume1 v-else :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
              <span
                v-if="player.user_id === mpStore.currentGame?.host_id"
                class="player-badge"
              >HOST</span>
              <button
                v-else-if="mpStore.isHost"
                class="player-kick-btn"
                title="Remove player"
                aria-label="Remove player"
                @click="mpStore.kickPlayer(player.user_id)"
              >
                <X class="player-kick-icon" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
            <template v-if="mpStore.gamePlayers.length < 10">
              <!-- Solo shows a row of open seats — an empty table reads as an
                   invitation, one lone chip reads as a dead room. -->
              <div
                v-for="i in (soloWaiting ? 3 : 1)"
                :key="`empty-${i}`"
                class="player-chip player-chip-empty"
                :class="{ 'seat-pulse': soloWaiting }"
                :style="soloWaiting ? { animationDelay: `${(i - 1) * 0.5}s` } : undefined"
              >
                <div class="player-avatar empty">+</div>
                <span class="player-name muted">Waiting…</span>
              </div>
            </template>
          </div>

          <!-- A public table deals itself 30 s after its first player sits;
               the server owns the clock, this only renders it. -->
          <AutoStartRing
            v-if="mpStore.autoStart"
            class="table-ring"
            :deadline="mpStore.autoStart.deadline"
          />

          <!-- The wait teaches the game; the tip lives with the table. -->
          <Transition name="tip-fade" mode="out-in">
            <p v-if="soloWaiting" :key="tipIndex" class="solo-tip">
              <span class="solo-tip-tag">WHILE YOU WAIT</span>
              {{ WAIT_TIPS[tipIndex] }}
            </p>
          </Transition>
        </section>

        <div class="waiting-actions">
          <!-- Exactly one primary at a time: the room's next action. A state
               you cannot act on is a status line, never a dead red slab.
               Inviting lives on the room card's share button - not a second
               CTA down here. -->
          <Button
            v-if="mpStore.isHost && mpStore.presentUserIds.length >= 2"
            variant="primary"
            size="lg"
            block
            @click="startGame"
          >
            START GAME ({{ mpStore.presentUserIds.length }})
          </Button>
          <p v-else class="waiting-text">
            {{ mpStore.isHost ? 'Waiting for players…' : 'Waiting for the host to start the game…' }}
          </p>
          <!-- One voice message at a time: the discovery nudge takes the
               row's place; dismissing it swaps the button back in. -->
          <div v-if="voiceStore.available" class="waiting-voice">
            <VoiceMicCluster :can-moderate="mpStore.isHost" nudge-inline hint="Talk while you play" />
          </div>
          <!-- Pull people you already know into the seat that is open. -->
          <InviteFriends />

          <!-- Alone, but people are waiting elsewhere: offer the fullest room
               rather than making "leave" or "play a bot" the only ways out. -->
          <button
            v-if="rescueTable"
            class="rescue-row"
            type="button"
            :disabled="mpStore.loading"
            @click="joinRescueTable"
          >
            <Users class="rescue-glyph" :size="14" :stroke-width="2" aria-hidden="true" />
            <span class="rescue-text">
              {{ rescueTable.players === 1 ? '1 player is' : `${rescueTable.players} players are` }}
              waiting in another room
            </span>
            <span class="rescue-cta">JOIN THEM</span>
          </button>
          <div class="waiting-escape">
            <button class="leave-link" @click="showLeaveConfirm = true">LEAVE ROOM</button>
            <span class="waiting-sep">·</span>
            <button class="leave-link" @click="playBotInstead">PLAY VS BOT INSTEAD</button>
          </div>
        </div>

        <!-- Quick chat doubles as the warm-up toy while the countdown runs -->
        <QuickChat />
      </div>
    </div>


    <!-- Guests only: plain sign-out abandons the guest profile and its
         server-side stats. Claiming (CLAIM ACCOUNT) is the safe exit. -->
    <ConfirmDialog
      :open="showSignOutConfirm"
      title="Sign out of this guest profile?"
      message="Signing out abandons this guest profile and its stats. CLAIM ACCOUNT keeps it - free, and everything you've earned stays."
      confirm-label="SIGN OUT ANYWAY"
      cancel-label="GO BACK"
      @confirm="confirmSignOut"
      @cancel="showSignOutConfirm = false"
    />

    <ConfirmDialog
      :open="showLeaveConfirm"
      title="Leave the room?"
      message="Players you've invited will see the room close. You can create a new one anytime."
      confirm-label="LEAVE"
      cancel-label="STAY"
      @confirm="confirmLeave"
      @cancel="showLeaveConfirm = false"
    />

    <!-- Join Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showJoinModal"
          class="modal-overlay"
          @click.self="showJoinModal = false"
        >
          <div class="join-modal">
            <h2 class="join-modal-title">JOIN GAME</h2>
            <p class="join-modal-desc">Enter the 6-character room code</p>

            <!-- The old placeholder was ABC123, which taught the exact typo that
                 breaks joins: codes never contain 1. -->
            <input
              v-model="joinCode"
              type="text"
              placeholder="BQ7K2M"
              maxlength="6"
              class="room-input"
              @input="joinCodeError = ''"
              @keyup.enter="joinGame"
              autofocus
            />

            <div v-if="joinCodeError || mpStore.error" class="error-banner">
              {{ joinCodeError || mpStore.error }}
            </div>

            <div class="join-modal-actions">
              <Button
                variant="ghost"
                size="md"
                block
                :disabled="mpStore.loading"
                @click="showJoinModal = false"
              >
                CANCEL
              </Button>
              <Button
                variant="primary"
                size="md"
                block
                :disabled="joinCode.length < 4 || mpStore.loading"
                @click="joinGame"
              >
                {{ mpStore.loading ? 'JOINING...' : 'JOIN' }}
              </Button>
            </div>
          </div>
        </div>
      </Transition>

    </Teleport>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted, onUnmounted, watch } from 'vue'
import { ArrowRight, Bot, Check, ChevronDown, ChevronRight, Copy, Flame, Hash, HelpCircle, Menu as MenuIcon, Minus, Pencil, Share2, Shield, Skull, Users, Volume1, VolumeX, X } from 'lucide-vue-next'
import { useRetentionStore } from '../stores/retentionStore'
import {
    getDailyRecord, fetchServerDailyRecord, dailyGridCells, buildDailyShareText, loadDailyProgress,
} from '../utils/dailyChallenge'
import { localDateString } from '../utils/seededRng'
import { generateDailyShareImage, shareOrDownload } from '../utils/shareImage'
import { useLobbyBoard } from '../composables/useLeaderboard'
import { flagEmoji } from '../utils/country'
import { useLiveTables } from '../composables/useLiveTables'
import { useOnlineCount } from '../composables/useOnlineCount'
import { useSocialStore } from '../stores/socialStore'
import { usePresence } from '../composables/usePresence'
import InviteFriends from './InviteFriends.vue'
import WhatsNew from './WhatsNew.vue'
import PublicTableCard from './PublicTableCard.vue'
// The 3D table is its own chunk: three.js loads only when a public room opens.
// A chunk that fails to load (a deploy since page load, a dropped connection)
// falls back to the list, the same as a browser that cannot draw the table.
const PublicTableLounge = defineAsyncComponent({
  loader: () => import('./PublicTableLounge.vue').then((m) => { loungeLoaded.value = true; return m }),
  onError: (_err, _retry, fail) => { loungeFailed.value = true; fail() },
})
import { publicTableView, PUBLIC_TABLE_RULES } from '../utils/publicTable'
import { openAccountModal } from '../composables/useAccountModal'
import { useWhatsNew } from '../composables/useWhatsNew'
import { nextBot, ladderProgress, isLadderComplete } from '../utils/botLadder'
import { currentRoute, navigate, routePath } from '../utils/routes'
import { enterRoomUrl } from '../composables/useRoomUrl'
import { track } from '../utils/analytics'
import { normalizeRoomCode, roomCodeProblem } from '@roomCode'
import { useBadges } from '../composables/useBadges'
import Avatar from './Avatar.vue'
import AutoStartRing from './AutoStartRing.vue'
import QuickChat from './QuickChat.vue'
import { preloadCardImages } from '../utils/preloadCardImages'
import { useAuthStore } from '../stores/authStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useVoiceStore } from '../stores/voiceStore'
import { useGameStore } from '../stores/gameStore'
import SiteFooter from './SiteFooter.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import Button from './ui/Button.vue'
import VoiceMicCluster from './game/VoiceMicCluster.vue'
import type { StackingMode } from '../utils/gameRules'
import { siteOrigin } from '../utils/siteOrigin'

const emit = defineEmits<{
  (e: 'playLocal', mode: StackingMode): void
  (e: 'playDaily'): void
  (e: 'showAuth'): void
}>()

const authStore = useAuthStore()
const mpStore = useMultiplayerStore()
const retention = useRetentionStore()

// Re-read on every mount: the lobby unmounts while the daily game plays, so
// returning from it always shows the fresh done state.
const dailyRecord = ref(getDailyRecord())
const dailyInProgress = loadDailyProgress() !== null
// The local record is per device. When it is missing but the player is signed
// in, ask the server before offering PLAY — otherwise a phone-then-laptop
// player starts a run the unique index will refuse to score.
onMounted(async () => {
    if (dailyRecord.value || !authStore.user?.id) return
    const remote = await fetchServerDailyRecord(authStore.user.id, localDateString())
    if (remote) dailyRecord.value = remote
})

const dailyCells = computed(() => dailyGridCells(dailyRecord.value?.log))

const dailyPercentile = computed(() => {
    const ctx = lb.dailyContext.value
    if (!ctx?.my_rank || !ctx.total_players) return null
    return Math.max(1, Math.ceil((ctx.my_rank / ctx.total_players) * 100))
})

const sharingDaily = ref(false)
const dailySharedAs = ref<'shared' | 'copied' | null>(null)
const dailyShareLabel = computed(() => {
    if (sharingDaily.value) return 'Preparing…'
    if (dailySharedAs.value === 'copied') return 'Copied'
    if (dailySharedAs.value === 'shared') return 'Shared'
    return 'Share result'
})

async function onShareDaily() {
    const rec = dailyRecord.value
    if (!rec || sharingDaily.value) return
    sharingDaily.value = true
    try {
        const ctx = lb.dailyContext.value
        const rank = ctx?.my_rank && ctx.total_players
            ? { rank: ctx.my_rank, total: ctx.total_players }
            : undefined
        const text = buildDailyShareText(rec, rank)

        // The run is only worth an image when we still have it. A record
        // recovered from the server has the outcome but no grid to draw.
        if (dailyCells.value.length) {
            const blob = await generateDailyShareImage({
                date: rec.date,
                result: rec.result,
                turns: rec.turns,
                cells: dailyCells.value,
                percentile: dailyPercentile.value,
                siteUrl: 'open-mercy.com',
            })
            if (blob) {
                await shareOrDownload(blob, `open-mercy-daily-${rec.date}.png`)
                dailySharedAs.value = 'shared'
                track('share', { method: 'image', content_type: 'daily' })
                return
            }
        }
        if (navigator.share) {
            await navigator.share({ text })
            dailySharedAs.value = 'shared'
            track('share', { method: 'native', content_type: 'daily' })
            return
        }
        await navigator.clipboard.writeText(text)
        dailySharedAs.value = 'copied'
        track('share', { method: 'clipboard', content_type: 'daily' })
    } catch {
        // Dismissed sheet, denied clipboard, canvas refusal — leave the button
        // unconfirmed rather than claiming a share that did not happen.
    } finally {
        sharingDaily.value = false
    }
}

const dailyDateLabel = new Date()
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  .toUpperCase()

const lb = useLobbyBoard()

const dailyPlayerCount = computed(() => lb.dailyContext.value?.total_players ?? 0)

// Only worth saying once the viewer is actually on the board — a rank of null
// means they haven't played today, which the deal card above already says.
const myDailyRank = computed(() => {
  const ctx = lb.dailyContext.value
  if (!ctx?.my_rank) return ''
  return `You're #${ctx.my_rank} of ${ctx.total_players} today`
})

function openLeaderboard() {
  navigate({ name: 'leaderboard' })
}

function openProfile(row: { share_code?: string | null }) {
  if (row.share_code) navigate({ name: 'profile', code: row.share_code })
}

// Eager availability probe: until the SQL functions exist on the project the
// rpc fails and the VIEW LEADERBOARD link never renders.
onMounted(() => { void lb.fetchDaily() })

// Badge chips for waiting-room seats. Being seen by badge is the point of
// having one — feature-detects until supabase/badges.sql is installed.
const { badges: seatBadges, fetchBadges } = useBadges()
watch(
  () => mpStore.gamePlayers.map(p => p.user_id),
  (ids) => { if (ids.length) void fetchBadges(ids) },
  { immediate: true },
)

// The daily board on the lobby shows shields, so it shows presence too.
const { presence, fetchPresence } = usePresence()
// Badges for the "Today's top" daily board.
const { badges: dailyBadges, fetchBadges: fetchDailyBadges } = useBadges()
watch(
  () => lb.daily.value.map(r => r.user_id),
  (ids) => {
    const real = ids.filter((x): x is string => !!x)
    if (real.length) {
      void fetchDailyBadges(real)
      void fetchPresence(real)
    }
  },
  { immediate: true },
)
function dailyBadgeFor(row: { user_id?: string | null }) {
  return row.user_id ? dailyBadges.value[row.user_id] : undefined
}
const voiceStore = useVoiceStore()
const gameStore = useGameStore()

const showJoinModal = ref(false)
// A join hit a room the server no longer knows — show the ended card, not a retry trap.
const roomEnded = ref(false)
const showLeaveConfirm = ref(false)
/** The 3D table could not start (no WebGL, an asset failed): use the list. */
const loungeFailed = ref(false)
// The table takes the whole screen, top bar included: LEAVE is the way out. The bar stays
// until the table's code has arrived, so a slow download never leaves a blank page.
const loungeLoaded = ref(false)
const atTable = computed(() => !!mpStore.currentGame && (mpStore.gameStatus === 'waiting' || mpStore.loungeShow) && mpStore.isPublicRoom && !loungeFailed.value)
const showSignOutConfirm = ref(false)
const editingName = ref(false)
const editTarget = ref<'room' | null>(null)
const nameInput = ref('')
const nameError = ref('')
const nameSuggestions = ref<string[]>([])
const joinCode = ref('')
const joinCodeError = ref('')
const copied = ref(false)
// The player's saved pick, not the last game's rules: the daily always plays Official.
const selectedStackingMode = ref<StackingMode>(gameStore.preferredStackingMode)

// Warm the deck art while the player is still in the lobby.
onMounted(preloadCardImages)

// The URL names a room: /r/CODE from an invite link or a reload, /public from a
// reload at the table. Enter it, so friends sharing the link drop straight in
// instead of copy-pasting the code. A dead link gets the room-ended card.
watch(currentRoute, async (r) => {
  if (r.name === 'room' && !mpStore.currentGame) joinCode.value = r.code
  await enterRoomUrl(r, mpStore)
  if (r.name === 'room' && !mpStore.currentGame && mpStore.error === 'Room not found') roomEnded.value = true
}, { immediate: true })

// Speaker button per seat: host cuts the mic room-wide, others mute locally.
function canVoiceMute(userId: string): boolean {
  if (userId === authStore.user?.id) return false
  if (!voiceStore.voiceUserIds.has(userId)) return false
  return mpStore.isHost ? voiceStore.unmutedUserIds.has(userId) : true
}
function voiceMuteTitle(userId: string): string {
  if (mpStore.isHost) return 'Mute for everyone'
  return voiceStore.localMutedUserIds.has(userId) ? 'Unmute for me' : 'Mute for me'
}
function handleVoiceMute(userId: string) {
  if (mpStore.isHost) void voiceStore.muteParticipant(userId)
  else voiceStore.toggleMuteForMe(userId)
}

const stackingModes: { value: StackingMode; label: string; desc: string }[] = [
  { value: 'official', label: 'OFFICIAL', desc: 'Printed rules — stack a draw only with equal or higher value' },
  { value: 'house', label: 'HOUSE', desc: 'Wild draws (+4 / +6 / +10) stack on anything; colored draws stay strict' },
  { value: 'casual', label: 'CASUAL', desc: 'Anything goes — any draw card stacks on any other draw card' },
]

function modeLabel(m: StackingMode) {
  return stackingModes.find((x) => x.value === m)?.label || 'OFFICIAL'
}

function modeDesc(m: StackingMode) {
  return stackingModes.find((x) => x.value === m)?.desc || ''
}

// A connected player is one we currently see in realtime presence. Self always
// counts. Falls back to "connected" if presence hasn't reported anyone yet
// (e.g. a peer on an older build that doesn't broadcast presence).
function isPlayerConnected(userId: string) {
  if (userId === authStore.user?.id) return true
  const present = mpStore.presentUserIds
  if (!present.length) return true
  return present.includes(userId)
}

// Turn raw store errors into friendly, actionable copy.
const friendlyError = computed(() => {
  const e = mpStore.error
  if (!e) return ''
  const map: Record<string, string> = {
    'Game not found': "That room code didn't match any game. Double-check it and try again.",
    'Game already started': 'That game already kicked off. Ask the host for a new room, or start your own.',
    'That room is full': 'That room is full. Start your own instead.',
  }
  if (map[e]) return map[e]
  if (/full/i.test(e)) return 'That room is full. Start your own instead.'
  if (/not found|already started/i.test(e)) return "Couldn't join that room. Check the code or start a new game."
  if (/logged in|profile/i.test(e)) return 'Something went wrong with your session. Try refreshing the page.'
  // Raw Postgres errors (e.g. a missing column before a migration ran) should
  // never reach the player verbatim.
  if (/column|relation|constraint|violates|pgrst/i.test(e)) return 'Something went wrong on our side. Try again in a moment.'
  return e
})

const currentModeDesc = computed(
  () => stackingModes.find((x) => x.value === selectedStackingMode.value)?.desc || '',
)

async function handleCreateGame() {
  roomEnded.value = false
  await mpStore.createGame(selectedStackingMode.value)
}

// Re-read on mount: the lobby unmounts while a solo game plays, so returning
// from a win always shows the newly unlocked opponent.
const nextOpponent = ref(nextBot())
const ladder = ref(ladderProgress())
const ladderDone = ref(isLadderComplete())
onMounted(() => {
    nextOpponent.value = nextBot()
    ladder.value = ladderProgress()
    ladderDone.value = isLadderComplete()
})

const LADDER_EXPLAINER =
    'The ladder: eight opponents from easiest to hardest, each with its own style. '
    + 'Beat one to unlock the next.'

function ordinal(n: number): string {
    const rem100 = n % 100
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`
    return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

// Mode first, ladder second. "Play vs Scrap / Opponent 1 of 8" told a new
// player neither what the mode was nor what the number meant — it reads as a
// completion count when it is a position.
const ladderHint = computed(() =>
    ladderDone.value
        ? `All 8 beaten - rematch ${nextOpponent.value.name}`
        : `Next up: ${nextOpponent.value.name}, ${ordinal(ladder.value.beaten + 1)} of ${ladder.value.total} opponents`,
)

const live = useLiveTables()
const online = useOnlineCount()
// Read once on the lobby so a waiting friend request can announce itself
// here, rather than only inside a screen nobody opens on purpose.
const social = useSocialStore()
onMounted(() => { if (authStore.isAuthenticated) void social.catchUp() })

onMounted(() => live.start())

const tableView = computed(() => publicTableView(live.joinable.value, live.loaded.value))

// Quick match picks the same table the card describes, the fullest open room by
// connected players, and refuses one that dealt between poll and tap. With none
// open it starts a new House table.
async function handleTakeSeat() {
    if (mpStore.loading) return
    roomEnded.value = false
    await mpStore.quickMatch(PUBLIC_TABLE_RULES)
}

async function joinGame() {
  if (mpStore.loading) return
  roomEnded.value = false

  // Reject a bad code here instead of letting the server's route miss it: that
  // path answers with a bare 404, which the browser reports as an anonymous
  // socket close, leaving nothing to show the player.
  const problem = roomCodeProblem(joinCode.value)
  if (problem) {
    joinCodeError.value = problem
    return
  }
  joinCodeError.value = ''

  const result = await mpStore.joinGame(normalizeRoomCode(joinCode.value))
  if (result || mpStore.error === 'Room not found') {
    showJoinModal.value = false
    joinCode.value = ''
  }
  if (!result && mpStore.error === 'Room not found') roomEnded.value = true
}

async function startGame() {
  await mpStore.startGame()
}

// Escape hatch from a dead waiting room — leave the room cleanly, then start a
// local bot game so the player isn't stuck staring at an empty lobby.
async function playBotInstead() {
  const mode = mpStore.stackingMode
  await mpStore.leaveGame()
  emit('playLocal', mode)
}

async function confirmLeave() {
  showLeaveConfirm.value = false
  await mpStore.leaveGame()
}

// Rename here happens on the waiting-room seat; everywhere else it lives in
// the account modal. editTarget says which seat shows the inline input.
function startEditName(target: 'room' = 'room') {
  nameError.value = ''
  const current = authStore.username
  nameInput.value = current && current !== 'Player' ? current : ''
  editTarget.value = target
  editingName.value = true
}

function closeNameEdit() {
  editingName.value = false
  editTarget.value = null
  nameError.value = ''
  nameSuggestions.value = []
}

/** Tapping a suggestion is the player accepting it, so save straight away
 *  rather than making them press enter on a name we handed them. */
function applySuggestion(name: string) {
  track('rename_suggestion_taken')
  nameInput.value = name
  nameError.value = ''
  nameSuggestions.value = []
  void saveName()
}

/** A blur after a rejection means the player is walking away from the name,
 *  not asking again with the same one - retrying would only re-reject it. */
function onNameBlur() {
  if (nameError.value) { closeNameEdit(); return }
  void saveName()
}

async function saveName() {
  if (!editingName.value) return
  const name = nameInput.value.trim()
  if (!name || name === authStore.username) { closeNameEdit(); return }

  const res = await authStore.updateUsername(name)
  if (!res.success) {
    // Stay open and say why. The store has always returned 'That name is
    // already taken' for a 23505; the reason never reached the player, so a
    // taken name read as the app ignoring them.
    nameError.value = res.error || 'Could not save that name'
    // Offered on failure only. Guessing again is the thing worth removing, and
    // a player whose first choice was free never needs to see these.
    nameSuggestions.value = await authStore.suggestUsernames(name)
    if (nameSuggestions.value.length) {
      track('rename_suggestions_shown', { count: nameSuggestions.value.length })
    }
    return
  }

  closeNameEdit()
  // Only once the profile actually took the name. Pushing it to the seat on a
  // failed rename left the player with two names - the new one on their seat,
  // the old one on their profile, leaderboard and share page.
  if (mpStore.currentGame) await mpStore.updateMyName(name)
}

// --- Account menu ---------------------------------------------------------
const accountOpen = ref(false)
const accountRef = ref<HTMLElement | null>(null)

function closeAccount() { accountOpen.value = false }

const whatsNewRef = ref<InstanceType<typeof WhatsNew> | null>(null)
const { unread: whatsNewUnread } = useWhatsNew()
// The burger is the only route to friends on a phone, so a waiting request lights it too.
const burgerLabel = computed(() => {
    const parts = [
        whatsNewUnread.value ? `${whatsNewUnread.value} new` : '',
        social.incoming.length ? `${social.incoming.length} friend request${social.incoming.length > 1 ? 's' : ''}` : '',
    ].filter(Boolean)
    return parts.length ? `Menu, ${parts.join(', ')}` : 'Menu'
})

function openWhatsNewFromMenu() {
    closeAccount()
    whatsNewRef.value?.openPanel()
}

function claimFromMenu() {
    closeAccount()
    upgradeAccount()
}

function onDocPointer(e: PointerEvent) {
    if (!accountOpen.value) return
    if (accountRef.value && !accountRef.value.contains(e.target as Node)) closeAccount()
}
function onDocKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeAccount()
}
onMounted(() => {
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
    document.removeEventListener('pointerdown', onDocPointer)
    document.removeEventListener('keydown', onDocKey)
})

// The profile lives entirely at /p/<share_code>, so without a code there is
// nowhere to go — the menu item hides rather than dead-ends. share_code only
// exists once leaderboards-v2.sql has run and the guest trigger has fired.
function viewProfile() {
    closeAccount()
    const code = authStore.profile?.share_code
    if (code) navigate({ name: 'profile', code })
}

function accountFromMenu() {
    closeAccount()
    openAccountModal()
}

function signOutFromMenu() {
    closeAccount()
    requestSignOut()
}

function upgradeAccount() {
  // In-place claim: the guest keeps their user id, so stats, badges and the
  // profile link survive. Nothing destructive — no confirm needed.
  emit('showAuth')
}

function requestSignOut() {
  if (authStore.isAnonymous) {
    showSignOutConfirm.value = true
    return
  }
  void authStore.signOut()
}

async function confirmSignOut() {
  showSignOutConfirm.value = false
  await authStore.signOut()
}

// Auto-join URL friends tap to drop straight into the room.
// --- Solo waiter: the room's one job is to fill itself ---

const WAIT_TIPS = [
  'Stack a draw card on a draw card to pass the pile along - it grows until someone eats the whole thing.',
  'Down to one card? Call "Mercy!" fast. Get caught silent and you draw 10.',
  'Hit 25 cards in hand and you are eliminated on the spot. No mercy.',
  'A 7 lets you swap hands with any player. A 0 rotates every hand around the table.',
  'Wild Color Roulette makes someone draw until they hit the called color.',
]
const tipIndex = ref(0)
let tipTimer: ReturnType<typeof setInterval> | null = null

// Connected players, not roster size: a joiner who closed the tab leaves a
// disconnected seat behind, and someone with only ghosts for company is
// exactly who needs the invite CTA.
const soloWaiting = computed(() =>
  mpStore.gameStatus === 'waiting' && mpStore.presentUserIds.length === 1)

// Someone alone in a waiting room leaves after about half a minute (GA, 30 days
// to 2026-08-14: 207 players left from the lobby phase, 31s average in room).
// The lobby is already polling which public rooms have people in them, so the
// dead end can offer company instead of only the exits. This room is excluded —
// quick match hosts publicly, so we would otherwise offer the player their own
// empty table.
const rescueTable = computed(() => {
  if (!soloWaiting.value) return null
  return [...live.joinable.value]
    .filter(t => t.code !== mpStore.roomCode && t.players > 0)
    .sort((a, b) => b.players - a.players)[0] ?? null
})

// Leave before sitting down elsewhere, or the abandoned room lingers in the
// directory advertising a player who is no longer in it.
async function joinRescueTable() {
  const target = rescueTable.value
  if (!target || mpStore.loading) return
  track('mp_lobby_rescue_taken', { players: target.players })
  await mpStore.leaveGame()
  const joined = await mpStore.joinGame(target.code, 'live')
  // It may have filled or started between the poll and the tap.
  if (!joined) await live.refresh()
}

watch(soloWaiting, (solo) => {
  if (solo && !tipTimer) {
    tipTimer = setInterval(() => {
      tipIndex.value = (tipIndex.value + 1) % WAIT_TIPS.length
    }, 6000)
  } else if (!solo && tipTimer) {
    clearInterval(tipTimer)
    tipTimer = null
  }
}, { immediate: true })

onUnmounted(() => {
  if (tipTimer) clearInterval(tipTimer)
})

const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share

/** Native share sheet where it exists (the mobile path); copy-link elsewhere. */
async function shareInvite() {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Open Mercy',
        text: 'Sit down - the game starts the moment you join.',
        url: inviteUrl(),
      })
      return
    } catch (e) {
      // Dismissing the sheet is a choice; any other failure (no share
      // target, unsupported payload) still deserves the copy fallback.
      if ((e as Error)?.name === 'AbortError') return
    }
  }
  copyLink()
}

function inviteUrl() {
  return new URL(routePath({ name: 'room', code: mpStore.roomCode }), siteOrigin()).toString()
}

// Copy the full invite link (not just the code) — tapping it opens the join
// lobby directly, which is what people actually share.
function copyLink() {
  // clipboard is unavailable / throws on an insecure context — only flip the
  // "copied" state when the write actually succeeds, so the UI doesn't lie.
  navigator.clipboard?.writeText(inviteUrl())
    .then(() => {
      copied.value = true
      setTimeout(() => (copied.value = false), 2000)
    })
    .catch(() => { /* no clipboard access — leave the UI unchanged */ })
}
</script>

<style scoped>
.lobby-container {
  min-height: 100vh;
  background: var(--bg-concrete);
  color: var(--text-primary);
  position: relative;
  display: flex;
  flex-direction: column;
}

/* TOP BAR — mirrors landing top bar pattern */
.lobby-top-bar {
  position: relative;
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  border-bottom: 1px solid rgba(255, 204, 0, 0.08);
  background: linear-gradient(180deg, rgba(10, 10, 11, 0.95), rgba(10, 10, 11, 0.7));
  flex-wrap: wrap;
}

.brand-mark {
  display: inline-flex;
  align-items: baseline;
  gap: var(--spacing-2);
  text-decoration: none;
  color: var(--text-primary);
}

.brand-mark-uno {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: 0.05em;
}

.brand-mark-nomercy {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  letter-spacing: 0.2em;
  color: var(--color-alert);
  text-shadow: 0 0 12px rgba(255, 42, 42, 0.5);
}

.top-bar-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-3);
}

.username-chip {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  letter-spacing: 0.15em;
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
}

.username-chip-editable {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.username-chip-editable:hover {
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.25);
}

.chip-avatar {
  margin: -3px 2px -3px -6px;
}

.chip-edit-icon {
  width: 12px;
  height: 12px;
  opacity: 0.6;
}

.username-edit-input {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-primary);
  letter-spacing: 0.15em;
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-neon-blue);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.4);
  width: 9rem;
  text-transform: uppercase;
}

.username-edit-input:focus {
  outline: none;
}

/* The input keeps its own width; this only stacks the reason beneath it. */
.name-edit {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  align-items: flex-start;
}

.username-edit-input.has-error {
  border-color: var(--color-alert);
}

.name-error {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-alert);
  letter-spacing: 0.05em;
  max-width: 20ch;
  line-height: 1.3;
}

.name-suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-1);
  max-width: 26ch;
}

.name-suggestions-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.name-suggestion {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-neon-blue);
  background: rgba(0, 243, 255, 0.08);
  border: 1px solid rgba(0, 243, 255, 0.35);
  border-radius: var(--radius-sm);
  padding: var(--spacing-1) var(--spacing-2);
  cursor: pointer;
  min-height: 32px;
  transition:
    background var(--duration-snap) var(--ease-snap),
    border-color var(--duration-snap) var(--ease-snap);
}

.name-suggestion:hover {
  background: rgba(0, 243, 255, 0.16);
  border-color: var(--color-neon-blue);
}

/* A chip is a tap target on a phone, not just a label. 24px was under
   everything else here - the inputs in this file are 44px. */
@media (max-width: 768px) {
  .name-suggestion {
    min-height: 40px;
    padding: var(--spacing-2) var(--spacing-3);
  }
}

.text-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  cursor: pointer;
  padding: var(--spacing-2);
  min-height: 44px;
  transition: color var(--duration-snap) var(--ease-snap);
}

.text-link:hover {
  color: var(--color-neon-blue);
}

.upgrade-link {
  color: var(--color-hazard);
}

.upgrade-link:hover {
  color: var(--text-primary);
}

/* CONTENT */
.lobby-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--spacing-8) var(--spacing-4);
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  gap: var(--spacing-6);
}

/* The entry view starts from the top. Centring it vertically left a void above
   and below on a tall screen and made the whole page read as floating. Declared
   after the base rule on purpose — same specificity, so source order decides.
   The waiting room and dead-room card stay centred; they're short. */
.lobby-content--top {
  justify-content: flex-start;
}

.error-banner {
  background: rgba(255, 42, 42, 0.1);
  border: 1px solid var(--color-alert);
  color: var(--color-alert);
  padding: var(--spacing-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  text-align: center;
  border-radius: var(--radius-sm);
}

/* The daily ritual wears the streak's hazard yellow — one retention loop,
   one color family, visually distinct from the red create zone and the
   cyan multiplayer world. */
/* Raised surface, not an outline on black. Elevation does the grouping in
   every dark UI worth copying; a bright border on pure black reads as a
   wireframe. The hazard tint is what keeps this the daily zone. */
.daily-card {
  background: linear-gradient(180deg, rgba(255, 204, 0, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 204, 0, 0.14);
  border-radius: var(--radius-md);
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

/* Today's board — the reason to come back tomorrow, next to the reason to
   play today. */
.board-card {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.board-head {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-2);
}

.board-title {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.board-count {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.board-list {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.board-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-2) 0;
  font-size: var(--text-sm);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.board-row:last-child {
  border-bottom: none;
}

.board-rank {
  width: 1.25rem;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.board-badge {
  flex: none;
  vertical-align: -2px;
}

.board-flag {
  flex-shrink: 0;
  font-size: var(--text-sm);
  line-height: 1;
}

.board-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  /* Renders as a <button> when the player has a shareable profile, so it
     needs the button chrome stripped back to plain text. */
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  text-align: left;
}

.board-name.clickable {
  cursor: pointer;
}

.board-name.clickable:hover {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* The outcome is the interesting part of each row, so it carries colour:
   cleared in N moves reads as a score, elimination reads as a casualty. */
.board-metric {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.board-metric--won {
  color: var(--color-neon-green);
}

.board-metric--out {
  color: var(--color-alert);
}

.board-row.mine .board-name,
.board-row.mine .board-rank {
  color: var(--color-hazard);
}

.board-empty,
.board-mine {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.board-mine {
  color: var(--text-secondary);
}

.daily-card :deep(.btn--secondary) {
  border-color: var(--color-hazard);
  color: var(--color-hazard);
}

.daily-card :deep(.btn--secondary:hover:not(:disabled)) {
  background: var(--color-hazard);
  color: #000;
}

.daily-card.done {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
}

/* The run, one cell per turn. Wraps naturally rather than forcing a fixed
   column count — the card is narrower than the share image and a hard grid
   would leave a ragged last row at some widths. */
.daily-run {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.run-cell {
  width: 11px;
  height: 11px;
  border-radius: 2px;
}

.run-cell--played { background: var(--color-neon-green); }
.run-cell--drew { background: #52525b; }
.run-cell--stacked { background: var(--color-alert); }

.daily-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
}

.legend-item :deep(svg) { flex-shrink: 0; }
.daily-legend .legend-item:nth-child(1) :deep(svg) { color: var(--color-neon-green); }
.daily-legend .legend-item:nth-child(2) :deep(svg) { color: #8b8b93; }
.daily-legend .legend-item:nth-child(3) :deep(svg) { color: var(--color-alert); }

.daily-elsewhere {
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

.daily-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex-wrap: wrap;
}

.daily-card .streak-chip {
  align-self: flex-start;
}

.daily-title {
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.12em;
  color: var(--text-primary);
}

.daily-date {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.18em;
  color: var(--text-muted);
}

.daily-desc {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
}

.daily-result {
  color: rgba(255, 204, 0, 0.85);
  letter-spacing: 0.06em;
}

.lb-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: rgba(255, 204, 0, 0.75);
  cursor: pointer;
}

.lb-link:hover {
  color: var(--color-hazard);
}

.streak-keep-link {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  text-align: center;
}

.streak-keep-link:hover {
  color: var(--text-primary);
}

.streak-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-3);
  background: rgba(255, 204, 0, 0.08);
  border: 1px solid rgba(255, 204, 0, 0.3);
  border-radius: 999px;
  font-family: var(--font-body);
  white-space: nowrap;
}

.streak-flame {
  width: 14px;
  height: 14px;
  color: #ffcc00;
  flex-shrink: 0;
}

.streak-count {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  color: var(--text-primary);
}

.streak-state {
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.streak-chip.at-risk {
  background: rgba(255, 42, 42, 0.07);
  border-color: var(--color-alert);
}

.streak-chip.at-risk .streak-flame {
  color: var(--color-alert);
  animation: streak-pulse 1.4s ease-in-out infinite;
}

.streak-state--warn {
  color: var(--color-alert);
}

@keyframes streak-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.88); }
}

@media (prefers-reduced-motion: reduce) {
  .streak-chip.at-risk .streak-flame { animation: none; }
}

.room-ended-card {
  background: rgba(255, 42, 42, 0.08);
  border: 1px solid var(--color-alert);
  border-radius: var(--radius-sm);
  padding: var(--spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  text-align: center;
}

.room-ended-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.12em;
  color: var(--color-alert);
  margin: 0;
}

.room-ended-sub {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
}

/* Stacked full-width, matching every other entry-view CTA. */
.room-ended-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

/* ENTRY */
.lobby-entry {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

/* Today's board reads as a footnote on a phone, not a headline: on narrow
   screens it drops below the ways to play. Inert on the desktop grid, where
   every card is placed explicitly. */
.public-table { order: 1; }
.board-card { order: 2; }
.streak-keep-link { order: 3; }

/* Two real columns on wide screens. Each card is placed into an explicit grid
   row rather than stacked inside a per-column wrapper, so row 1 is as tall as
   the taller of (deal, create) and row 2 as tall as the taller of (board,
   list) — which is what makes the card borders line up across the two
   columns. The pair is centred as a unit, so there's no lone void. */
@media (min-width: 1180px) {
  /* Widened to hold rail + gap + the original 600px column, still centred.
     Scoped to the entry state (--top) — the waiting room and every other
     lobby view are single 600px columns and stretch into hollow slabs at
     this width. */
  .lobby-content--top {
    max-width: 964px;
  }

  .lobby-entry {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr);
    column-gap: var(--spacing-8);
    row-gap: var(--spacing-4);
    align-items: stretch;
  }

  /* Extra air under the title — the row-gap that separates the two card rows
     is too tight to also serve as the space below a heading. Compound
     selector because the base `.entry-heading { margin: 0 }` is declared
     later in this file and would otherwise win on source order. */
  .lobby-entry .entry-heading {
    grid-column: 1 / -1;
    grid-row: 1;
    margin-bottom: var(--spacing-6);
  }
  .daily-card       { grid-column: 1; grid-row: 2; }
  .create-card      { grid-column: 2; grid-row: 2; }
  .board-card       { grid-column: 1; grid-row: 3 / span 2; }
  .mode-list        { grid-column: 2; grid-row: 3; }
  .public-table     { grid-column: 2; grid-row: 4; }
  /* Side by side here. .lobby-entry > outranks the base .mode-list, which
     comes later in this file. */
  .lobby-entry > .mode-list { flex-direction: row; }
  .mode-list > .mode-item { flex: 1; min-width: 0; }
  .streak-keep-link { grid-column: 1 / -1; grid-row: 5; }

  /* Whichever card is shorter gets stretched to its row, so pin the board's
     link to the bottom — the slack then lands in the list, where more entries
     would go, instead of above a floating footer. */
  .board-card .lb-link { margin-top: auto; }
  /* Same row as CREATE A ROOM: pinned down so the two buttons line up. */
  .daily-play { margin-top: auto; }
}


/* Grouped on a neutral surface. Unboxing this left the rules control and its
   caption floating as loose fragments under a bare slab — the container was
   doing real grouping work. Neutral rather than red-tinted so the button is
   still the only saturated thing here. */
.create-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
  padding: var(--spacing-4);
}

.create-eyebrow {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--text-primary);
}

.create-note {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-secondary);
}

@media (min-width: 601px) {
  .create-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
  .create-card > * { grid-column: 1 / -1; }
  .create-card > .create-eyebrow { grid-column: 1; grid-row: 1; }
  .create-card > .mode-pills { grid-column: 2; grid-row: 1; }
}

.mode-desc {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

/* One hairline container holds all three options, so the group reads as a
   single control instead of three chips floating in a row — and the mobile
   full-width stretch below lands inside a frame rather than as loose text. */
.mode-pills {
  display: flex;
  gap: 2px;
  margin-left: auto;
  padding: 2px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
}

/* Reads as one segmented control, not three outlined chips: only the
   selected rule set is drawn, the alternatives are plain text until
   hovered. */
.mode-pill {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  padding: var(--spacing-1) var(--spacing-3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-snap) var(--ease-snap);
}

.mode-pill:hover {
  color: var(--text-primary);
}

.mode-pill.active {
  color: var(--color-hazard);
  background: rgba(255, 204, 0, 0.1);
}

/* MODE LIST — the secondary ways in, on their own surface with internal
   hairlines. Rows carry a name and a description stacked, so there's no dead
   middle between a left-aligned label and a right-aligned hint. */
.mode-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.chip-badge,
.account-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--color-hazard);
  color: var(--bg-concrete);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 1;
}

.account-count {
  margin-left: auto;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 60px;
  padding: var(--spacing-3) var(--spacing-4);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap);
}

.mode-item:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.045);
}

.mode-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mode-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

/* Bare glyphs, no chip. The icon's own shape already separates the rows;
   a tinted box and border around each one added three more containers to a
   column that had too many. Colour still carries the zone (cyan =
   multiplayer, neutral = practice) per the palette convention. */
.mode-glyph--cyan {
  color: var(--color-neon-blue);
}

/* Not a button: .mode-item is already one, and nesting interactive elements
   is invalid and breaks keyboard nav. A labelled span still gets the native
   hover tooltip and is announced by screen readers. */
/* Account menu -------------------------------------------------------------
   Anchored to the name chip and right-aligned, so on a narrow screen it grows
   inwards from the right edge instead of pushing past it. */
.account {
  position: relative;
  display: inline-flex;
}

.account-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 12rem;
  /* Never wider than the viewport minus the bar's own padding. */
  max-width: calc(100vw - var(--spacing-8));
  display: flex;
  flex-direction: column;
  padding: var(--spacing-1);
  background: #16171a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.65);
  z-index: 60;
}

.account-item {
  appearance: none;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--spacing-2) var(--spacing-3);
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.8);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.account-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

/* Phones only: the burger replaces What's new, the name chip and the claim
   link, and the menu grows the rows they used to be. Same 640px as the
   What's new sheet, so the panel the menu opens is always the sheet. */
.menu-burger,
.menu-phone {
  display: none;
}

.menu-burger {
  position: relative;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
}

/* Phones only: dims the page under the open menu, and a tap on it closes the
   menu. Click, not pointerdown, so the tap cannot land on what is underneath. */
.menu-scrim {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(0, 0, 0, 0.7);
}

/* The release card is fixed at z-index 60 at the page root; while the menu is
   open the bar, and the scrim inside it, must sit above it. */
.lobby-top-bar.menu-open {
  z-index: 70;
}

.burger-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-alert);
  box-shadow: 0 0 0 2px var(--bg-concrete);
}

.menu-who {
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
}

.menu-who-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.menu-who-name {
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-who-kind {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.menu-claim {
  align-items: center;
  justify-content: center;
  min-height: 40px;
  margin: 0 var(--spacing-3) var(--spacing-3);
  background: rgba(255, 204, 0, 0.06);
  border: 1px solid rgba(255, 204, 0, 0.4);
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--color-hazard);
  cursor: pointer;
}

.account-item--first {
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0;
}

.menu-new {
  font-family: var(--font-body);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--color-alert);
}

@media (max-width: 640px) {
  .menu-burger,
  .menu-phone {
    display: flex;
  }

  .menu-scrim {
    display: block;
  }

  /* Above the scrim, so the X that closes the menu stays lit. */
  .menu-burger {
    z-index: 61;
  }

  /* .top-bar-cta > raises specificity over WhatsNew's own scoped display. */
  .username-chip,
  .upgrade-link,
  .top-bar-cta > .bar-whatsnew {
    display: none;
  }

  .account-menu {
    min-width: 17rem;
  }
}

.account-item--out {
  margin-top: var(--spacing-1);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  color: rgba(255, 255, 255, 0.5);
}

.mode-help {
  position: relative;
  display: inline-flex;
  vertical-align: -2px;
  margin-left: var(--spacing-1);
  color: rgba(255, 255, 255, 0.35);
  cursor: help;
}

.mode-help:hover { color: var(--color-hazard); }

/* Replaces the native title tooltip, which the browser delays about a second
   and paints in OS chrome that ignores the theme entirely. Opens above so the
   card's bottom edge cannot clip it. */
.mode-tip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  width: max-content;
  max-width: 17rem;
  padding: var(--spacing-2) var(--spacing-3);
  background: #16171a;
  border: 1px solid rgba(255, 204, 0, 0.3);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.72rem;
  line-height: 1.5;
  letter-spacing: 0.01em;
  text-transform: none;
  text-align: left;
  white-space: normal;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
  z-index: 40;
}

.mode-tip-title {
  display: block;
  margin-bottom: 2px;
  color: var(--color-hazard);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.66rem;
}

/* The notch, drawn as a rotated square tucked under the panel edge. */
.mode-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 8px;
  height: 8px;
  margin: -5px 0 0 -4px;
  background: #16171a;
  border-right: 1px solid rgba(255, 204, 0, 0.3);
  border-bottom: 1px solid rgba(255, 204, 0, 0.3);
  transform: rotate(45deg);
}

.mode-help:hover .mode-tip {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .mode-tip { transition: none; }
}

.mode-glyph--dim {
  color: var(--text-muted);
}

/* Weight and colour carry the hierarchy here, not caps and tracking. The
   screen had fifteen wide-tracked uppercase labels competing at once; display
   caps now belong to the brand and the primary button only. */
.mode-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.mode-name {
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
}

.mode-hint {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.4;
}

.mode-chev {
  color: var(--text-muted);
  flex-shrink: 0;
  transition:
    transform var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap);
}

.mode-item:hover:not(:disabled) .mode-chev {
  transform: translateX(3px);
  color: var(--text-secondary);
}

/* WAITING ROOM */
.waiting-room {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
  align-items: center;
}

.just-ended-note {
  margin: 0;
  padding: var(--spacing-2) var(--spacing-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  text-align: center;
}

.room-code-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-6) var(--spacing-4) var(--spacing-4);
  background: rgba(255, 204, 0, 0.04);
  border: 1px solid var(--color-hazard-dim);
  border-radius: var(--radius-md);
  width: 100%;
}

.room-code-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.3em;
}

.room-code-value {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 9vw, 3.5rem);
  letter-spacing: 0.4rem;
  line-height: 1.1;
  color: var(--color-hazard);
  text-shadow: 0 0 20px rgba(255, 204, 0, 0.4);
}

.room-code-actions {
  display: flex;
  gap: var(--spacing-2);
  width: 100%;
  justify-content: center;
  flex-wrap: wrap;
}

.code-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  background: var(--color-hazard);
  border: none;
  color: var(--bg-concrete);
  padding: var(--spacing-2) var(--spacing-4);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  cursor: pointer;
  border-radius: var(--radius-sm);
  min-height: 44px;
  transition: filter var(--duration-snap) var(--ease-snap);
}

.code-action-btn:hover {
  filter: brightness(1.1);
}

.code-action-share {
  background: transparent;
  color: var(--color-hazard);
  border: 1px solid var(--color-hazard);
}

.code-action-share:hover {
  background: rgba(255, 204, 0, 0.08);
  filter: none;
}

.code-action-icon {
  width: 14px;
  height: 14px;
}

/* Rule-set metadata as the card's footer: one hairline in the card's own
   hazard family separates it from the code + action above. */
.room-mode-footer {
  width: 100%;
  margin-top: var(--spacing-2);
  padding-top: var(--spacing-3);
  border-top: 1px solid rgba(255, 204, 0, 0.12);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-1);
}

.room-mode-tag {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.2em;
}

/* The table: one surface for seats, clock and tips - cyan-zoned, the
   multiplayer color, mirroring the hazard-zoned room-code card above it. */
.table-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  /* Extra air above: the boundary between the room card and the table is
     the page's one big seam - it gets double the row rhythm (24px gap +
     24px margin), matching the approved wireframe. */
  margin-top: var(--spacing-6);
  padding: var(--spacing-4);
  background: rgba(0, 243, 255, 0.03);
  border: 1px solid rgba(0, 243, 255, 0.16);
  border-radius: var(--radius-md);
}

.table-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.table-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.3em;
  color: var(--color-neon-blue);
}

.table-count {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.table-count-cap {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  color: var(--text-muted);
}

.table-ring {
  align-self: center;
  padding-top: var(--spacing-2);
}

.players-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-2);
}

.player-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-pill);
}

.player-chip-empty {
  border-style: dashed;
  opacity: 0.5;
}

.player-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-neon-blue);
  color: var(--bg-concrete);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: var(--text-sm);
}

.player-avatar.empty {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-muted);
}

.player-name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.player-name.muted {
  color: var(--text-muted);
}

.player-badge {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-hazard);
  color: var(--bg-concrete);
  padding: 2px var(--spacing-2);
  border-radius: var(--radius-sm);
  letter-spacing: 0.1em;
  font-weight: bold;
}

.player-kick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 2px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 42, 42, 0.15);
  color: var(--color-alert);
  cursor: pointer;
  transition: background 0.15s;
}

.player-kick-btn:hover {
  background: rgba(255, 42, 42, 0.35);
}

.player-kick-icon {
  width: 13px;
  height: 13px;
}

.player-name-editable {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  cursor: pointer;
  padding: 0;
}
.player-name-editable:hover { color: var(--color-neon-blue, #2ad4ff); }

.seat-edit-icon {
  width: 11px;
  height: 11px;
  opacity: 0.6;
}

.seat-edit-input {
  width: 7rem;
  font-size: var(--text-sm);
  padding: var(--spacing-1) var(--spacing-2);
}

.entry-heading {
  font-family: var(--font-display);
  font-size: 1.9rem;
  text-wrap: balance;
  letter-spacing: 0.08em;
  color: var(--text-primary);
  text-align: center;
  margin: 0;
}

.room-mode-desc {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-align: center;
  line-height: 1.5;
  margin: 0;
  max-width: 60ch;
}

.seat-avatar-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

/* Same green, same size as PresenceDot elsewhere. This one means "socket is
   live in this room", which is a stricter fact than last-seen, but a player
   should not have to learn two marks that both mean "here". Bottom-left, the
   same corner as every presence dot; the tier pip owns the bottom-right. */
.presence-dot {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  box-shadow: 0 0 0 2px var(--bg-concrete);
  transition: background var(--duration-snap) var(--ease-snap);
}

.presence-dot.connected {
  background: var(--color-neon-green);
}

@media (max-width: 560px) {
  .entry-heading { font-size: 1.4rem; }
  .mode-desc { line-height: 1.8; }
}

/* Rides inside the table card: a hairline-separated footer, not another
   floating box (same treatment as the room card's rules footer). */
.solo-tip {
  margin: 0;
  padding: var(--spacing-3) 0 0;
  width: 100%;
  border-top: 1px solid rgba(0, 243, 255, 0.12);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  text-align: center;
}

.solo-tip-tag {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.2em;
  color: var(--color-hazard, #ffcc00);
  margin-bottom: var(--spacing-1);
}

.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.35s ease;
}
.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}

.seat-pulse {
  animation: seat-pulse 2.4s ease-in-out infinite;
}

@keyframes seat-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.8; }
}

@media (prefers-reduced-motion: reduce) {
  .seat-pulse { animation: none; }
}

/* Neon cyan: this is a multiplayer action, same zone as quick match. */
.rescue-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
  margin-top: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background: rgba(0, 243, 255, 0.06);
  border: 1px solid rgba(0, 243, 255, 0.22);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.rescue-row:hover:not(:disabled) {
  background: rgba(0, 243, 255, 0.1);
  border-color: rgba(0, 243, 255, 0.45);
}

.rescue-row:disabled { opacity: 0.6; cursor: default; }

.rescue-glyph { color: var(--color-neon-blue); flex-shrink: 0; }

.rescue-text { flex: 1; min-width: 0; }

.rescue-cta {
  color: var(--color-neon-blue);
  font-weight: 600;
  letter-spacing: 0.08em;
  white-space: nowrap;
  flex-shrink: 0;
}

.waiting-escape {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  flex-wrap: wrap;
}

.waiting-sep { color: var(--text-muted); }

.waiting-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-3);
  width: 100%;
}

.waiting-voice {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.seat-voice-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--color-neon-green);
  color: var(--color-neon-green);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.85;
}

.seat-voice-btn:hover { opacity: 1; }

.seat-voice-btn.is-muted {
  border-color: var(--color-alert);
  color: var(--color-alert);
}

/* Green presence dot on seats connected to voice; pulses while they talk. */
.voice-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-neon-green);
  opacity: 0.5;
  flex-shrink: 0;
}

.voice-dot.speaking {
  opacity: 1;
  box-shadow: 0 0 8px var(--color-neon-green);
  animation: voice-dot-pulse 0.9s ease-in-out infinite;
}

@keyframes voice-dot-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.5); }
}

@media (prefers-reduced-motion: reduce) {
  .voice-dot.speaking { animation: none; }
}

.waiting-text {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.15em;
  text-align: center;
}

.leave-link {
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  cursor: pointer;
  padding: var(--spacing-2);
  min-height: 44px;
  transition: color var(--duration-snap) var(--ease-snap);
}

.leave-link:hover {
  color: var(--color-alert);
}

/* JOIN MODAL */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--spacing-4);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--duration-soft) var(--ease-soft);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active {
    transition: none;
  }
}

.join-modal {
  background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
  border: 1px solid rgba(0, 243, 255, 0.25);
  border-radius: var(--radius-md);
  padding: var(--spacing-8) var(--spacing-6);
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 0 40px rgba(0, 243, 255, 0.12);
}

.join-modal-title {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  letter-spacing: 0.1em;
  color: var(--text-primary);
  margin: 0 0 var(--spacing-2);
}

.join-modal-desc {
  font-family: var(--font-body);
  color: var(--text-muted);
  margin: 0 0 var(--spacing-6);
  font-size: var(--text-sm);
}

.room-input {
  width: 100%;
  padding: var(--spacing-4);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  text-align: center;
  letter-spacing: 0.4rem;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  margin-bottom: var(--spacing-4);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-snap) var(--ease-snap);
}

.room-input:focus {
  outline: none;
  border-color: var(--color-neon-blue);
}

.join-modal-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-3);
}

/* MOBILE TWEAKS */
@media (max-width: 600px) {
  .lobby-top-bar {
    padding: var(--spacing-3);
  }

  .brand-mark-uno {
    font-size: var(--text-lg);
  }

  .brand-mark-nomercy {
    font-size: var(--text-xs);
    letter-spacing: 0.15em;
  }

  /* Menu items keep a comfortable tap target and may wrap on a narrow phone. */
  .account-item {
    padding: var(--spacing-3);
    min-height: 40px;
    white-space: normal;
  }

  /* Brand and burger share one row; the burger sits on the right. */
  .top-bar-cta {
    margin-left: auto;
  }

  .lobby-content {
    padding: var(--spacing-6) var(--spacing-4);
    gap: var(--spacing-4);
  }

  /* The picker sits under the eyebrow and note here, so it spans the column
     rather than right-anchoring away from its label. */
  .mode-pills {
    width: 100%;
    margin-left: 0;
  }

  .mode-pill {
    flex: 1;
  }
}
</style>
