import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Loads pi-mcp-adapter (installed from packages.txt) with one change: in RPC mode its
 * `session_start` handler no longer blocks Pi's startup.
 *
 * The adapter awaits its "Allow project MCP server?" dialog inside `session_start`. Pi's RPC
 * mode only starts reading stdin after `session_start` resolves, so the dialog can never be
 * answered and Pi exits with code 0 (T3 Code: "Pi RPC read failed: pi process exited with
 * code 0"). Letting the handler finish in the background lets the RPC client answer the
 * dialog once startup completes. Other modes are unchanged.
 *
 * The adapter's own extension entry must be filtered out (`"extensions": []` on its
 * settings package entry, set by setup.sh) so it isn't loaded twice.
 */
export default async function (pi: ExtensionAPI) {
	const entry = join(getAgentDir(), "npm", "node_modules", "pi-mcp-adapter", "index.ts");
	const { default: mcpAdapter } = (await import(pathToFileURL(entry).href)) as {
		default: (pi: ExtensionAPI) => void;
	};

	const on: ExtensionAPI["on"] = (event, handler) => {
		if (event !== "session_start") return pi.on(event, handler);
		return pi.on(event, ((startEvent, ctx) => {
			const result = (handler as (e: typeof startEvent, c: typeof ctx) => unknown)(startEvent, ctx);
			if (ctx.mode !== "rpc") return result;
			Promise.resolve(result).catch((error: unknown) => {
				console.error(`MCP: session_start failed: ${error instanceof Error ? error.message : String(error)}`);
			});
		}) as typeof handler);
	};

	mcpAdapter(new Proxy(pi, { get: (target, key) => (key === "on" ? on : Reflect.get(target, key)) }));
}
