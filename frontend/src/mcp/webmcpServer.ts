/**
 * WebMCP standard surface for UNO No Mercy.
 *
 * Exposes the tool catalog (built in registerTools.ts against the live stores)
 * through two complementary surfaces so any flavour of visiting agent can play:
 *
 *   1. Native document.modelContext (W3C Web Model Context API, provided by the
 *      mcp-b polyfill). This is what a standards-capable agentic browser reads
 *      via getRegisteredToolInfos and invokes via tool-call events. Primary,
 *      verified discovery surface.
 *   2. An in-page MCP server over a TabServerTransport (postMessage), for mcp-b
 *      clients / browser extensions that connect with a TabClientTransport
 *      rather than reading the native registry.
 *
 * Both wrap the same `catalog.callTool`. Lazily imported so the MCP SDK
 * code-splits out of the main bundle. Everything is best-effort: a failure on
 * either surface is logged and never breaks the app or the other surface.
 */
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk'
import { TabServerTransport } from '@mcp-b/transports'
import type { ToolCatalog } from './registerTools'

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

export async function connectWebMcp(catalog: ToolCatalog): Promise<void> {
    const execFor = (name: string) => async (args: Record<string, unknown>): Promise<ToolResult> => {
        try {
            const result = await catalog.callTool(name, (args ?? {}) as Record<string, any>)
            return { content: [{ type: 'text', text: JSON.stringify(result) }] }
        } catch (err: any) {
            return { content: [{ type: 'text', text: String(err?.message ?? err) }], isError: true }
        }
    }

    // Surface 2 first: the transport server. Done before native registration so
    // any modelContext setup it performs can't clobber our native tools.
    try {
        const server = new BrowserMcpServer({ name: catalog.serverName, version: catalog.serverVersion })
        // Same-origin only: with '*', any site that window.open()s the game
        // could postMessage tool calls into the player's signed-in tab.
        await server.connect(new TabServerTransport({ allowedOrigins: [location.origin] }))
        for (const t of catalog.tools) {
            server.registerTool({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
                execute: execFor(t.name),
            } as any)
        }
    } catch (err) {
        console.warn('[uno-mcp] transport server unavailable:', err)
    }

    // Surface 1 last: the native W3C registry an agent discovers on visit.
    const native: any = (document as any).modelContext ?? (navigator as any).modelContext
    if (native?.registerTool) {
        for (const t of catalog.tools) {
            try {
                native.registerTool({
                    name: t.name,
                    description: t.description,
                    inputSchema: t.inputSchema,
                    execute: execFor(t.name),
                })
            } catch (err) {
                console.warn(`[uno-mcp] native registerTool failed for ${t.name}:`, err)
            }
        }
    }
}
