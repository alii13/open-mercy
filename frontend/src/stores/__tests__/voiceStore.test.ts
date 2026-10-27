/**
 * The voice store drives a lazily-imported RealtimeKit client with a token
 * minted over the game socket. These tests run the real multiplayer store
 * against the scripted fake WebSocket (same pattern as multiplayerStore.test)
 * and a fake SDK, pinning the join flow, mute, speaking decay, the
 * voice-unavailable posture, and leave-room-leaves-voice.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { PersonalView, ServerMsg } from '@protocol'

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
        },
    },
}))

vi.mock('../authStore', () => ({
    useAuthStore: () => ({ username: 'TESTER', user: { id: 'me' } }),
}))

const { setVoiceDucking } = vi.hoisted(() => ({ setVoiceDucking: vi.fn() }))
vi.mock('../../composables/useMusic', () => ({ music: { setVoiceDucking } }))

// --- Fake RealtimeKit SDK ---

type Handler = (...args: unknown[]) => void

function emitter() {
    const handlers: Record<string, Handler[]> = {}
    return {
        on(ev: string, cb: Handler) { (handlers[ev] ??= []).push(cb) },
        emit(ev: string, ...args: unknown[]) { for (const h of handlers[ev] ?? []) h(...args) },
    }
}

function makeFakeMeeting() {
    const self = Object.assign(emitter(), {
        id: 'peer-self',
        customParticipantId: 'me',
        audioEnabled: true,
        enableAudio: vi.fn(async () => { self.audioEnabled = true; self.emit('audioUpdate', { audioEnabled: true }) }),
        disableAudio: vi.fn(() => { self.audioEnabled = false; self.emit('audioUpdate', { audioEnabled: false }) }),
    })
    const joined = Object.assign(new Map<string, { id: string; customParticipantId?: string }>(), emitter())
    const participants = Object.assign(emitter(), { joined, disableAllAudio: vi.fn(async (_allow: boolean) => {}) })
    return {
        join: vi.fn(async () => {}),
        leave: vi.fn(async () => { self.emit('roomLeft', { state: 'left' }) }),
        self,
        participants,
    }
}

let fakeMeeting = makeFakeMeeting()
const init = vi.fn(async (_opts: { authToken: string }) => fakeMeeting)

vi.mock('@cloudflare/realtimekit', () => ({ default: { init } }))

// --- Fake game socket (multiplayerStore.test pattern) ---

class FakeWebSocket {
    static OPEN = 1
    static instances: FakeWebSocket[] = []
    readyState = 1
    sent: string[] = []
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: ((e?: { reason?: string }) => void) | null = null
    url: string
    constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this) }
    send(data: string) { this.sent.push(data) }
    close() { this.readyState = 3; this.onclose?.() }
    open() { this.onopen?.() }
    receive(msg: ServerMsg) { this.onmessage?.({ data: JSON.stringify(msg) }) }
}

// Node test env has no DOM/media — stub the slice the playback path touches.
function makeFakeAudioEl() {
    return {
        autoplay: false,
        muted: false,
        srcObject: null as unknown,
        play: vi.fn(async () => {}),
        remove: vi.fn(),
    }
}
const createdAudioEls: ReturnType<typeof makeFakeAudioEl>[] = []
vi.stubGlobal('document', {
    createElement: (tag: string) => {
        if (tag !== 'audio') throw new Error('unexpected element: ' + tag)
        const el = makeFakeAudioEl()
        createdAudioEls.push(el)
        return el
    },
    body: { appendChild: vi.fn() },
})
vi.stubGlobal('MediaStream', class {
    tracks: unknown[]
    constructor(tracks: unknown[]) { this.tracks = tracks }
})
vi.stubGlobal('window', { addEventListener: vi.fn() })

vi.stubGlobal('WebSocket', FakeWebSocket)
const fakeStorage = {
    store: {} as Record<string, string>,
    getItem(k: string) { return this.store[k] ?? null },
    setItem(k: string, v: string) { this.store[k] = v },
    removeItem(k: string) { delete this.store[k] },
}
vi.stubGlobal('localStorage', fakeStorage)

import { useMultiplayerStore } from '../multiplayerStore'
import { useVoiceStore } from '../voiceStore'

function lobbyView(): PersonalView {
    return {
        status: 'lobby', gameId: null, hostUserId: 'me', players: [], you: null,
        currentPlayerId: null, turnState: 'WAITING_FOR_ACTION', direction: 1, drawStack: 0,
        currentColor: 'red', discardTop: null, deckCount: 0, discardCount: 0,
        rouletteTargetColor: null, pendingDiscardAllCards: null, pendingDrawnWildCard: null,
        pendingDrawnCard: null, canChallengeDraw4: false,
        stackingMode: 'official', winnerId: null,
    }
}

async function joinRoom(mp: ReturnType<typeof useMultiplayerStore>) {
    const joining = mp.joinGame('AB12CD')
    for (let i = 0; i < 20 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
    ws.open()
    ws.receive({ t: 'hello', roomCode: 'AB12CD', userId: 'me', hostUserId: 'me' })
    ws.receive({ t: 'snapshot', seq: 0, game: lobbyView() })
    await joining
    return ws
}

/** joinVoice → server answers with a token → SDK connects. */
async function goLive(ws: FakeWebSocket, voice: ReturnType<typeof useVoiceStore>) {
    await voice.joinVoice()
    expect(JSON.parse(ws.sent[ws.sent.length - 1]!)).toEqual({ t: 'voice-join' })
    ws.receive({ t: 'voice-token', token: 'rtk-token', meetingId: 'meet-1' })
    // onVoiceToken awaits the (mocked) dynamic import and join.
    for (let i = 0; i < 20 && voice.state !== 'live'; i++) await Promise.resolve()
}

beforeEach(() => {
    setActivePinia(createPinia())
    FakeWebSocket.instances = []
    fakeStorage.store = {}
    fakeMeeting = makeFakeMeeting()
    init.mockClear()
    createdAudioEls.length = 0
    setVoiceDucking.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('joining voice', () => {
    it('sends voice-join, connects the SDK with the token, and goes live unmuted', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)

        await goLive(ws, voice)

        expect(init).toHaveBeenCalledWith(expect.objectContaining({
            authToken: 'rtk-token',
            defaults: { audio: true, video: false },
        }))
        expect(fakeMeeting.join).toHaveBeenCalled()
        expect(voice.state).toBe('live')
        expect(voice.muted).toBe(false)
        expect(voice.voiceUserIds.has('me')).toBe(true)
        // Background music drops while the call is live.
        expect(setVoiceDucking).toHaveBeenCalledWith(true)
    })

    it('hides the feature when the server answers voice-unavailable', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)

        await voice.joinVoice()
        ws.receive({ t: 'error', code: 'voice-unavailable' })

        expect(voice.available).toBe(false)
        expect(voice.state).toBe('off')
        expect(init).not.toHaveBeenCalled()
    })

    it('errors with RETRY when the SDK cannot connect', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        fakeMeeting.join.mockRejectedValueOnce(new Error('no mic'))

        await goLive(ws, voice)

        expect(voice.state).toBe('error')
        expect(voice.errorText).toContain('retry')
        // The retry path is allowed to run again.
        await voice.joinVoice()
        expect(voice.state).toBe('requesting-token')
    })
})

describe('live controls', () => {
    it('toggles mute through the SDK and follows audioUpdate', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)

        await voice.toggleMute()
        expect(fakeMeeting.self.disableAudio).toHaveBeenCalled()
        expect(voice.muted).toBe(true)

        await voice.toggleMute()
        expect(fakeMeeting.self.enableAudio).toHaveBeenCalled()
        expect(voice.muted).toBe(false)
    })

    it('maps activeSpeaker peers to game userIds and decays after the hold', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)

        fakeMeeting.participants.joined.set('peer-2', { id: 'peer-2', customParticipantId: 'opp' })
        fakeMeeting.participants.joined.emit('participantJoined', fakeMeeting.participants.joined.get('peer-2'))
        expect(voice.voiceUserIds.has('opp')).toBe(true)

        vi.useFakeTimers()
        fakeMeeting.participants.emit('activeSpeaker', { peerId: 'peer-2', volume: 40 })
        expect(voice.speakingUserIds.has('opp')).toBe(true)

        vi.advanceTimersByTime(1500)
        expect(voice.speakingUserIds.has('opp')).toBe(false)
    })
})

describe('remote audio playback', () => {
    it('attaches a playing element per remote track and detaches on mute/leave', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)

        // The core SDK plays nothing itself — audioUpdate must land in an <audio>.
        const opp = { id: 'peer-2', customParticipantId: 'opp', audioEnabled: true, audioTrack: { kind: 'audio' } }
        fakeMeeting.participants.joined.set('peer-2', opp)
        fakeMeeting.participants.joined.emit('audioUpdate', opp)
        expect(createdAudioEls.length).toBe(1)
        expect(createdAudioEls[0]!.autoplay).toBe(true)
        expect(createdAudioEls[0]!.srcObject).toBeTruthy()
        expect(createdAudioEls[0]!.play).toHaveBeenCalled()

        // Opponent mutes: their track stops, the element goes away.
        fakeMeeting.participants.joined.emit('audioUpdate', { ...opp, audioEnabled: false, audioTrack: null })
        expect(createdAudioEls[0]!.remove).toHaveBeenCalled()

        // A participant already talking when we tear down gets cleaned up too.
        fakeMeeting.participants.joined.emit('audioUpdate', opp)
        expect(createdAudioEls.length).toBe(2)
        await voice.leaveVoice()
        expect(createdAudioEls[1]!.remove).toHaveBeenCalled()
    })
})

describe('moderation', () => {
    function seatOpp(overrides: Record<string, unknown> = {}) {
        const opp = {
            id: 'peer-2',
            customParticipantId: 'opp',
            audioEnabled: true,
            audioTrack: { kind: 'audio' },
            disableAudio: vi.fn(async () => {}),
            kick: vi.fn(async () => {}),
            ...overrides,
        }
        fakeMeeting.participants.joined.set('peer-2', opp)
        fakeMeeting.participants.joined.emit('participantJoined', opp)
        return opp
    }

    it('host force-mute, mute-everyone, and voice-kick go through the SDK', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)
        const opp = seatOpp()
        expect(voice.unmutedUserIds.has('opp')).toBe(true)

        await voice.muteParticipant('opp')
        expect(opp.disableAudio).toHaveBeenCalled()

        await voice.muteEveryone()
        expect(fakeMeeting.participants.disableAllAudio).toHaveBeenCalledWith(true)

        await mp.kickPlayer('opp')
        expect(opp.kick).toHaveBeenCalled()

        // Their mic going off is reflected for the button visibility.
        opp.audioEnabled = false
        fakeMeeting.participants.joined.emit('audioUpdate', opp)
        expect(voice.unmutedUserIds.has('opp')).toBe(false)
    })

    it('mute-for-me silences only my element and survives track re-attach', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)
        const opp = seatOpp()
        fakeMeeting.participants.joined.emit('audioUpdate', opp)
        const el = createdAudioEls[0]!
        expect(el.muted).toBe(false)

        voice.toggleMuteForMe('opp')
        expect(el.muted).toBe(true)
        expect(opp.disableAudio).not.toHaveBeenCalled()

        // Their track re-flows (e.g. self unmute) — my local mute must hold.
        fakeMeeting.participants.joined.emit('audioUpdate', opp)
        expect(el.muted).toBe(true)

        voice.toggleMuteForMe('opp')
        expect(el.muted).toBe(false)
    })

    it('being kicked tears voice down with the session', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)

        ws.onclose?.({ reason: 'kicked' })
        for (let i = 0; i < 10; i++) await Promise.resolve()

        expect(fakeMeeting.leave).toHaveBeenCalled()
        expect(voice.state).toBe('off')
        expect(mp.currentGame).toBeNull()
        expect(mp.error).toBe('You were removed from the room')
    })
})

describe('leaving', () => {
    it('leaving the room leaves voice too', async () => {
        const mp = useMultiplayerStore()
        const voice = useVoiceStore()
        const ws = await joinRoom(mp)
        await goLive(ws, voice)

        await mp.leaveGame()

        expect(fakeMeeting.leave).toHaveBeenCalled()
        expect(voice.state).toBe('off')
        expect(voice.voiceUserIds.size).toBe(0)
        expect(setVoiceDucking).toHaveBeenLastCalledWith(false)
    })
})
