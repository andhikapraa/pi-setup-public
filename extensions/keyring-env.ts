import { execFileSync } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Load API keys that other Pi extensions read from environment variables (e.g. pi-exa's
 * EXA_API_KEY) from the OS keyring into this Pi process only. Runs at extension load,
 * before any extension's `session_start`, so it works however Pi is launched (terminal,
 * SSH, T3 Code, other desktop apps) without storing keys in files or shell profiles.
 *
 * An already-set variable wins. Missing keyring items are skipped silently.
 *   macOS:  security add-generic-password -s <service> -a "$USER" -w
 *   Linux:  secret-tool store --label <name> service <service>
 */
const KEYS: ReadonlyArray<{ env: string; service: string }> = [
	{ env: "EXA_API_KEY", service: "exa-api" },
	// pi-firecrawl (firecrawl ext).
	{ env: "FIRECRAWL_API_KEY", service: "firecrawl-api-key" },
	// JSON array of {name, baseUrl, apiKey}: the dokploy CLI's multi-instance form (dokploy ext).
	{ env: "DOKPLOY_INSTANCES", service: "dokploy-instances" },
];

/** Read one secret from the OS keyring; undefined when absent or unsupported. */
function readKeyring(service: string): string | undefined {
	const command: [string, string[]] | undefined =
		process.platform === "darwin"
			? // The login keychain is named by path: SSH sessions don't search it by default.
				["security", ["find-generic-password", "-s", service, "-a", userInfo().username, "-w", join(homedir(), "Library", "Keychains", "login.keychain-db")]]
			: process.platform === "linux"
				? ["secret-tool", ["lookup", "service", service]]
				: undefined;
	if (!command) return undefined;
	try {
		const value = execFileSync(command[0], command[1], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 5000,
		}).trim();
		return value || undefined;
	} catch {
		return undefined;
	}
}

export default function keyringEnv(_pi: ExtensionAPI): void {
	for (const { env, service } of KEYS) {
		if (process.env[env]) continue;
		const value = readKeyring(service);
		if (value) process.env[env] = value;
	}
}
