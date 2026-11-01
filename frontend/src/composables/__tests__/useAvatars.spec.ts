import { describe, expect, it, vi, beforeEach } from 'vitest'

type Rows = { data: { id: string; avatar_version: number | null }[] | null; error: { message: string } | null }

const { lookup, update, upload, remove } = vi.hoisted(() => ({
    lookup: vi.fn<(ids: string[]) => Promise<Rows>>(),
    update: vi.fn<(patch: Record<string, unknown>, id: string) => Promise<{ error: null | { message: string } }>>(async () => ({ error: null })),
    upload: vi.fn<(path: string, blob: Blob, opts: Record<string, unknown>) => Promise<{ error: null | { message: string } }>>(async () => ({ error: null })),
    remove: vi.fn<(paths: string[]) => Promise<{ error: null }>>(async () => ({ error: null })),
}))

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({ in: (_col: string, ids: string[]) => lookup(ids) }),
            update: (patch: Record<string, unknown>) => ({ eq: (_col: string, id: string) => update(patch, id) }),
        }),
        storage: { from: () => ({ upload, remove }) },
    },
}))

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const PHOTO = '33333333-3333-4333-8333-333333333333'
const ME = '44444444-4444-4444-8444-444444444444'

/** Module-level cache, so every test starts from a fresh module. */
async function fresh() {
    vi.resetModules()
    return import('../useAvatars')
}

const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => {
    lookup.mockReset()
    lookup.mockImplementation(async ids => ({
        data: ids.map(id => ({ id, avatar_version: id === PHOTO ? 42 : null })),
        error: null,
    }))
    update.mockClear()
    upload.mockClear()
    remove.mockClear()
})

describe('photo lookup', () => {
    it('asks once for every seat that renders together', async () => {
        const { requestAvatars } = await fresh()
        requestAvatars([A, PHOTO])
        requestAvatars([B])
        await tick()
        expect(lookup).toHaveBeenCalledTimes(1)
        expect(lookup.mock.calls[0]![0].sort()).toEqual([A, B, PHOTO].sort())
    })

    it('never asks about bots, whose ids are not user ids', async () => {
        const { requestAvatars } = await fresh()
        requestAvatars(['bot-1', 'player', A])
        await tick()
        expect(lookup.mock.calls[0]![0]).toEqual([A])
    })

    it('does not ask again for a player it already knows', async () => {
        const { requestAvatars } = await fresh()
        requestAvatars([PHOTO])
        await tick()
        requestAvatars([PHOTO])
        await tick()
        expect(lookup).toHaveBeenCalledTimes(1)
    })

    it('gives a url only to players with a photo', async () => {
        const { requestAvatars, avatarUrlFor } = await fresh()
        requestAvatars([A, PHOTO])
        await tick()
        expect(avatarUrlFor(A)).toBeNull()
        expect(avatarUrlFor(PHOTO)).toMatch(new RegExp(`/avatars/${PHOTO}/42$`))
    })

    it('stops asking when the column is not there yet', async () => {
        lookup.mockResolvedValue({ data: null, error: { message: 'column profiles.avatar_version does not exist' } })
        const { requestAvatars, avatarUrlFor } = await fresh()
        requestAvatars([A])
        await tick()
        requestAvatars([B])
        await tick()
        expect(lookup).toHaveBeenCalledTimes(1)
        expect(avatarUrlFor(B)).toBeNull()
    })
})

describe('saving a photo', () => {
    it('uploads into the player own folder and shows the new photo everywhere', async () => {
        const { uploadAvatar, avatarUrlFor } = await fresh()
        const blob = new Blob(['x'], { type: 'image/webp' })
        const result = await uploadAvatar(ME, blob)
        expect(result.error).toBeNull()
        const patch = update.mock.calls[0]![0]
        expect(update.mock.calls[0]![1]).toBe(ME)
        expect(typeof patch.avatar_version).toBe('number')
        expect(upload).toHaveBeenCalledWith(`${ME}/${patch.avatar_version}`, blob, expect.objectContaining({ contentType: 'image/webp' }))
        expect(avatarUrlFor(ME)).toMatch(new RegExp(`/avatars/${ME}/${patch.avatar_version}$`))
    })

    it('deletes the previous photo once the new one is saved', async () => {
        lookup.mockResolvedValue({ data: [{ id: ME, avatar_version: 7 }], error: null })
        const { requestAvatars, uploadAvatar } = await fresh()
        requestAvatars([ME])
        await tick()
        await uploadAvatar(ME, new Blob(['x'], { type: 'image/webp' }))
        expect(remove).toHaveBeenCalledWith([`${ME}/7`])
    })

    it('keeps the old photo when the upload is refused', async () => {
        upload.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } })
        const { uploadAvatar, avatarUrlFor } = await fresh()
        const result = await uploadAvatar(ME, new Blob(['x'], { type: 'image/webp' }))
        expect(result.error).toBeTruthy()
        expect(update).not.toHaveBeenCalled()
        expect(avatarUrlFor(ME)).toBeNull()
    })

    it('deletes its own upload when the profile refuses the save', async () => {
        update.mockResolvedValueOnce({ error: { message: 'permission denied for table profiles' } })
        const { uploadAvatar, avatarUrlFor } = await fresh()
        const result = await uploadAvatar(ME, new Blob(['x'], { type: 'image/webp' }))
        expect(result.error).toBeTruthy()
        const uploadedPath = upload.mock.calls[0]![0]
        expect(remove).toHaveBeenCalledWith([uploadedPath])
        expect(avatarUrlFor(ME)).toBeNull()
    })

    it('removes the photo and falls back to the initial', async () => {
        const { uploadAvatar, removeAvatar, avatarUrlFor } = await fresh()
        await uploadAvatar(ME, new Blob(['x'], { type: 'image/webp' }))
        const version = update.mock.calls[0]![0].avatar_version
        await removeAvatar(ME)
        expect(remove).toHaveBeenLastCalledWith([`${ME}/${version}`])
        expect(update).toHaveBeenLastCalledWith({ avatar_version: null }, ME)
        expect(avatarUrlFor(ME)).toBeNull()
    })
})
