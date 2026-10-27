export type CouchHostAction = 'return-lobby' | 'close-room' | 'kick'
export type RoomPhase = 'lobby' | 'playing' | 'finished'

export interface CouchHostActionContext {
  couch: boolean
  hostUserId: string
  socketUserId: string
  role: 'player' | 'display'
  phase: RoomPhase
}

export function couchHostActionError(
  action: CouchHostAction,
  context: CouchHostActionContext,
): 'not-host' | 'not-in-lobby' | null {
  if (!context.couch || context.role !== 'display' || context.socketUserId !== context.hostUserId) {
    return 'not-host'
  }
  if (action === 'kick' && context.phase !== 'lobby') return 'not-in-lobby'
  return null
}
