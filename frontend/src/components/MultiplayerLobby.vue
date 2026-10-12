<template>
  <div class="lobby-container">
    <!-- Top bar — slim, brand left, identity + auth controls right. No scan-line. -->
    <header class="lobby-top-bar">
      <a class="brand-mark" href="#" @click.prevent>
        <span class="brand-mark-uno">OPEN</span>
        <span class="brand-mark-nomercy">MERCY</span>
      </a>

      <div class="top-bar-cta">
        <WhatsNew />
        <div v-if="editingName && editTarget === 'bar'" class="name-edit">
          <input
            v-model="nameInput"
            v-focus-ring
            class="username-edit-input"
            :class="{ 'has-error': nameError }"
            maxlength="20"
            aria-label="Edit nickname"
            :aria-invalid="!!nameError"
            aria-describedby="name-error-bar"
            @input="nameError = ''; nameSuggestions = []"
            @keyup.enter="saveName"
            @keyup.esc="closeNameEdit"
            @blur="onNameBlur"
          />
          <p v-if="nameError" id="name-error-bar" class="name-error" role="alert">{{ nameError }}</p>
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
        <!-- One account surface for guests and signed-in users alike: the name
             is the control, and everything about "you" hangs off it. Stats used
             to need its own header slot; nesting it here costs no width, which
             matters most on a phone. -->
        <div v-else class="account" ref="accountRef">
          <button
            class="username-chip username-chip-editable"
            aria-haspopup="menu"
            :aria-expanded="accountOpen"
            @click="accountOpen = !accountOpen"
          >
            {{ authStore.username }}
            <span v-if="social.incoming.length" class="chip-badge" :title="`${social.incoming.length} friend request${social.incoming.length > 1 ? 's' : ''}`">{{ social.incoming.length }}</span>
            <ChevronDown class="chip-edit-icon" :stroke-width="2" aria-hidden="true" />
          </button>
          <div v-if="accountOpen" class="account-menu" role="menu">
            <button v-if="authStore.profile?.share_code" class="account-item" role="menuitem" @click="viewProfile">View profile</button>
            <button v-if="!social.unavailable" class="account-item" role="menuitem" @click="openFriends">
              Friends
              <span v-if="social.incoming.length" class="account-count">{{ social.incoming.length }}</span>
            </button>
            <button class="account-item" role="menuitem" @click="editNameFromMenu">Edit name</button>
            <button class="account-item account-item--out" role="menuitem" @click="signOutFromMenu">Sign out</button>
          </div>
        </div>
        <!-- Stays in the bar rather than the menu: it is the conversion CTA,
             and a guest who never opens the menu should still see it. -->
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
          <Button variant="secondary" size="md" block :disabled="mpStore.loading" @click="handleQuickMatch">
            QUICK MATCH
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
            <span v-if="!retention.playedToday" class="streak-state streak-state--warn">Play today to keep it</span>
          </div>
          <template v-if="!dailyRecord">
            <p class="daily-desc">The same shuffle for every player in the world. One scored attempt.</p>
            <Button variant="secondary" size="md" block @click="$emit('playDaily')">
              PLAY
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
              <Badge
                v-if="dailyBadgeFor(row)?.badge"
                :badge="dailyBadgeFor(row)!.badge"
                :points="dailyBadgeFor(row)!.points"
                :progress="dailyBadgeFor(row)!.progress"
                :presence="row.user_id ? presence[row.user_id] ?? null : undefined"
                size="mark"
                link
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

        <!-- Primary action: create a room. The rules choice only applies to
             created games, so it lives inside the same card, above the button
             that consumes it. -->
        <div class="create-card">
          <div class="mode-row">
            <span class="mode-label">Rules</span>
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
          </div>
          <p class="mode-desc">{{ currentModeDesc }}</p>
          <Button
            variant="primary"
            size="lg"
            block
            :disabled="mpStore.loading"
            @click="handleCreateGame"
          >
            {{ mpStore.loading ? 'CREATING...' : 'CREATE GAME' }}
          </Button>
        </div>

        <!-- Other ways in: icon-led list rows, one identity color per mode -->
        <div class="mode-list" role="group" aria-label="Other ways to play">
          <div class="mode-overline-row">
            <span class="mode-overline">Or jump in</span>
            <!-- Hidden below a floor on purpose: a true small number reads as
                 an empty game and sends the reader away. See useOnlineCount. -->
            <span v-if="online.show.value" class="mode-online">
              <span class="live-dot" aria-hidden="true" />{{ online.count.value }} ONLINE
            </span>
          </div>
          <!-- Only rendered when a public room with a free seat actually
               exists. An empty "live games" row advertises that nobody is
               playing, which is worse than no row at all. -->
          <button
            v-if="live.joinable.value.length"
            class="mode-item mode-item--live"
            :disabled="mpStore.loading"
            @click="handleJoinLive"
          >
            <span class="mode-glyph mode-glyph--live"><Users :size="16" :stroke-width="2" aria-hidden="true" /></span>
            <span class="mode-text">
              <span class="mode-name"><span class="live-dot" aria-hidden="true" />{{ liveHeadline }}</span>
              <span class="mode-hint">{{ liveHint }}</span>
            </span>
            <ChevronRight class="mode-chev" :size="16" aria-hidden="true" />
          </button>
          <button class="mode-item" :disabled="mpStore.loading" @click="handleQuickMatch">
            <span class="mode-glyph mode-glyph--cyan"><Zap :size="16" :stroke-width="2" aria-hidden="true" /></span>
            <span class="mode-text">
              <span class="mode-name">{{ mpStore.loading ? 'Matching…' : 'Quick match' }}</span>
              <span class="mode-hint">Join a public room - the game starts itself</span>
            </span>
            <ChevronRight class="mode-chev" :size="16" aria-hidden="true" />
          </button>
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
            <ChevronRight class="mode-chev" :size="16" aria-hidden="true" />
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
              <!-- The tier shield is the avatar (the shared Badge carries the
                   hover tooltip); the letter circle is only the no-data
                   fallback, same contract as the in-game seats. -->
              <div class="seat-avatar-wrap">
                <Badge
                  v-if="seatBadges[player.user_id]"
                  :badge="seatBadges[player.user_id]!.badge"
                  :points="seatBadges[player.user_id]!.points"
                  :progress="seatBadges[player.user_id]!.progress"
                  size="mark"
                  link
                  class="seat-avatar"
                />
                <div v-else class="player-avatar">
                  {{ player.name?.charAt(0) }}
                </div>
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

          <!-- Public rooms deal themselves once two players are seated; the
               server owns the clock, this only renders it. -->
          <AutoStartRing
            v-if="mpStore.autoStart"
            class="table-ring"
            :deadline="mpStore.autoStart.deadline"
            :paused="mpStore.autoStart.paused"
          />

          <!-- Waiting for a friend who is nearly here: the room can hold the
               door open one extra minute, once, and then it deals. -->
          <button
            v-if="mpStore.autoStart && !mpStore.autoStart.paused && mpStore.autoStart.bumpsLeft > 0"
            class="hold-row"
            type="button"
            title="Hold the room open one more minute"
            @click="mpStore.extendAutoStart()"
          >
            <Clock class="hold-glyph" :size="14" :stroke-width="2" aria-hidden="true" />
            WAIT LONGER
          </button>

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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ArrowRight, Bot, Check, ChevronDown, ChevronRight, Clock, Copy, Flame, Hash, HelpCircle, Minus, Pencil, Share2, Skull, Users, Volume1, VolumeX, X, Zap } from 'lucide-vue-next'
import { useRetentionStore } from '../stores/retentionStore'
import {
    getDailyRecord, fetchServerDailyRecord, dailyGridCells, buildDailyShareText,
} from '../utils/dailyChallenge'
import { localDateString } from '../utils/seededRng'
import { generateDailyShareImage, shareOrDownload } from '../utils/shareImage'
import { useLeaderboard } from '../composables/useLeaderboard'
import { flagEmoji } from '../utils/country'
import { useLiveTables } from '../composables/useLiveTables'
import { useOnlineCount } from '../composables/useOnlineCount'
import { useSocialStore } from '../stores/socialStore'
import { usePresence } from '../composables/usePresence'
import InviteFriends from './InviteFriends.vue'
import WhatsNew from './WhatsNew.vue'
import { nextBot, ladderProgress, isLadderComplete } from '../utils/botLadder'
import { navigate } from '../utils/routes'
import { track } from '../utils/analytics'
import { isRoomCode, normalizeRoomCode, roomCodeProblem } from '@roomCode'
import { useBadges } from '../composables/useBadges'
import Badge from './Badge.vue'
import AutoStartRing from './AutoStartRing.vue'
import QuickChat from './QuickChat.vue'
import { vFocusRing } from '../directives/focusRing'
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

const emit = defineEmits<{
  (e: 'playLocal', mode: StackingMode): void
  (e: 'playDaily'): void
  (e: 'showAuth'): void
  (e: 'showFriends'): void
}>()

const authStore = useAuthStore()
const mpStore = useMultiplayerStore()
const retention = useRetentionStore()

// Re-read on every mount: the lobby unmounts while the daily game plays, so
// returning from it always shows the fresh done state.
const dailyRecord = ref(getDailyRecord())
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

const lb = useLeaderboard()

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
onMounted(() => { void lb.fetchBoards() })

// Badge chips for waiting-room seats. Being seen by badge is the point of
// having one — feature-detects until supabase/badges.sql is installed.
const { badges: seatBadges, fetchBadges } = useBadges()
watch(
  () => mpStore.gamePlayers.map(p => p.user_id),
  (ids) => { if (ids.length) void fetchBadges(ids) },
  { immediate: true },
)

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
const showSignOutConfirm = ref(false)
const editingName = ref(false)
const editTarget = ref<'bar' | 'room' | null>(null)
const nameInput = ref('')
const nameError = ref('')
const nameSuggestions = ref<string[]>([])
const joinCode = ref('')
const joinCodeError = ref('')
const copied = ref(false)
const selectedStackingMode = ref<StackingMode>(gameStore.stackingMode)

// When the page loads with ?join=ABCDEF, pre-fill the join input and
// fire the join automatically. Friends sharing the invite URL drop
// straight into the room instead of copy-pasting the code manually.
onMounted(() => {
  // Warm the deck art while the player is still in the lobby.
  preloadCardImages()
  const params = new URLSearchParams(window.location.search)
  const code = params.get('join')?.toUpperCase().trim()
  if (!code) return

  // Strip the param so a reload doesn't re-trigger.
  params.delete('join')
  const newSearch = params.toString()
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
  window.history.replaceState({}, '', newUrl)

  // Only auto-join if the user isn't already in a game and the code
  // shape is plausible. Anything weird falls through to the user
  // opening the join modal themselves.
  if (mpStore.currentGame) return
  if (!isRoomCode(code)) return

  joinCode.value = code
  void mpStore.joinGame(code, 'link').then((res) => {
    if (!res && mpStore.error === 'Room not found') roomEnded.value = true
  })
})

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
    'Game is full (max 20 players)': 'That room is full (20 players max). Start your own instead.',
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
// The daily board on the lobby shows shields, so it shows presence too.
const { presence, fetchPresence } = usePresence()
onMounted(() => { if (authStore.isAuthenticated) void social.refresh() })

function openFriends() {
    closeAccount()
    emit('showFriends')
}
onMounted(() => live.start())

const liveHeadline = computed(() => {
    const n = live.waitingPlayers.value
    return n === 1 ? 'Someone is waiting' : `${n} players waiting`
})

const liveHint = computed(() => {
    const rooms = live.joinable.value.length
    const roomText = rooms === 1 ? '1 open room' : `${rooms} open rooms`
    const running = live.inProgressCount.value
    if (!running) return `${roomText} - sit down now`
    return `${roomText}, ${running} game${running === 1 ? '' : 's'} in progress`
})

// Fullest room first: joining the busiest table is more likely to start a
// game than padding out a room with one bored person in it.
async function handleJoinLive() {
    const target = [...live.joinable.value].sort((a, b) => b.players - a.players)[0]
    if (!target || mpStore.loading) return
    roomEnded.value = false
    const joined = await mpStore.joinGame(target.code, 'live')
    // The room may have filled or started between poll and click.
    if (!joined) await live.refresh()
}

async function handleQuickMatch() {
  roomEnded.value = false
  await mpStore.quickMatch(selectedStackingMode.value)
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

// Rename can be triggered from the top-bar chip ('bar') or the waiting-room
// seat ('room'); editTarget controls which one shows the inline input.
function startEditName(target: 'bar' | 'room' = 'bar') {
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

function editNameFromMenu() {
    closeAccount()
    startEditName('bar')
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
  const u = new URL(window.location.href)
  u.search = ''
  u.hash = ''
  u.searchParams.set('join', mpStore.roomCode)
  return u.toString()
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
  color: var(--color-neon-blue);
}

.upgrade-link:hover {
  color: var(--color-hazard);
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
  .board-card       { grid-column: 1; grid-row: 3; }
  .mode-list        { grid-column: 2; grid-row: 3; }
  .streak-keep-link { grid-column: 1 / -1; grid-row: 4; }

  /* Whichever card is shorter gets stretched to its row, so pin the board's
     link to the bottom — the slack then lands in the list, where more entries
     would go, instead of above a floating footer. */
  .board-card .lb-link { margin-top: auto; }
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

.mode-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.mode-desc {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.mode-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
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
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
  padding: var(--spacing-2);
}

.mode-overline-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-2);
}

.mode-overline {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: var(--spacing-1) var(--spacing-2) var(--spacing-2);
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

.mode-online {
  display: inline-flex;
  align-items: center;
  padding: var(--spacing-1) var(--spacing-2) var(--spacing-2);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--color-neon-green);
  white-space: nowrap;
}

.mode-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 60px;
  padding: var(--spacing-3);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap);
}

.mode-item + .mode-item {
  box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.055);
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

.mode-glyph--live {
  color: var(--color-neon-green);
}

/* Slightly lifted from the neighbouring rows: this one is only on screen when
   there is genuinely someone to play against, so it should read as the live
   option rather than another menu item. */
.mode-item--live {
  border-color: rgba(0, 255, 102, 0.22);
  background: rgba(0, 255, 102, 0.04);
}

.mode-item--live:hover:not(:disabled) {
  border-color: rgba(0, 255, 102, 0.45);
}

.live-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: var(--spacing-2);
  border-radius: 50%;
  background: var(--color-neon-green);
  vertical-align: middle;
  animation: live-pulse 2s ease-in-out infinite;
}

@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
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

.hold-row {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-3);
  background: transparent;
  border: 1px solid rgba(0, 243, 255, 0.22);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.hold-row:hover {
  background: rgba(0, 243, 255, 0.08);
  border-color: rgba(0, 243, 255, 0.45);
  color: var(--text-primary);
}

.hold-glyph { color: var(--color-neon-blue); flex-shrink: 0; }

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

.seat-avatar :deep(.badge-emblem) {
  width: 28px;
  height: 28px;
}

/* Same green, same size as PresenceDot elsewhere. This one means "socket is
   live in this room", which is a stricter fact than last-seen, but a player
   should not have to learn two marks that both mean "here". */
.presence-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  border: 2px solid var(--bg-concrete);
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
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(6px);
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

  /* Was display:none when the chip was only a rename affordance and the bar
     was tight. It is now the only route to profile, stats and sign out, so it
     has to survive on a phone — truncated rather than hidden. */
  .username-chip {
    max-width: 8.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.7rem;
    padding: var(--spacing-1) var(--spacing-2);
    min-height: 36px;
  }

  /* Menu items keep a comfortable tap target and may wrap on a narrow phone. */
  .account-item {
    padding: var(--spacing-3);
    min-height: 40px;
    white-space: normal;
  }

  /* Brand + account links share one row; compact the links so they fit,
     and right-anchor the cluster so a worst-case wrap still looks placed. */
  .top-bar-cta {
    gap: var(--spacing-1);
    margin-left: auto;
  }

  .lobby-top-bar .text-link {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    padding: var(--spacing-1) var(--spacing-2);
    min-height: 36px;
    white-space: nowrap;
  }

  .lobby-content {
    padding: var(--spacing-6) var(--spacing-4);
    gap: var(--spacing-4);
  }

  .mode-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-2);
  }

  /* Label stacks above the control here, so the control spans the column
     rather than right-anchoring away from its own label. */
  .mode-pills {
    width: 100%;
    margin-left: 0;
  }

  .mode-pill {
    flex: 1;
  }
}
</style>
