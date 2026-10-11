// postinstall: download omp-compaction's snapcompact renderer for this platform.
// Source: @oh-my-pi/pi-natives-<platform>@18.1.16 (MIT) from the npm registry, verified
// against the pinned sha512 integrity. Unsupported platforms or network failures leave
// snapcompact disabled (the rest of the extension still works) and exit 0.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VERSION = "18.1.16";
const PACKAGES = {
	"darwin-arm64": {
		integrity: "sha512-dbiaJcOZzgbSiarEPz5iWAZ6DPXMW42zCo4LX7LLYeIdQhkJQM4aQJrB7XxVYqGU8Y6PFhBNWkT3B6FY4Q4qWg==",
		files: ["pi_natives.darwin-arm64.node"],
	},
	"linux-x64": {
		integrity: "sha512-PaMHc/oT9AngEsHwY+I/Q6oq7mHREsFuJZ+lBb59Dzs6PSRN8PwI76uJM3eSM0AagKxLCXk2sDL3S2YnTg5K1Q==",
		files: ["pi_natives.linux-x64-baseline.node", "pi_natives.linux-x64-modern.node"],
	},
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "extensions", "omp-compaction", "native");
const tag = `${process.platform}-${process.arch}`;
const spec = PACKAGES[tag];

function done(message) {
	console.log(`[pi-setup] ${message}`);
	process.exit(0);
}

if (!spec) done(`no snapcompact renderer for ${tag}; /compact snapcompact will be unavailable`);
if (spec.files.every(file => existsSync(join(target, file)))) done(`snapcompact renderer already present (${tag})`);

const url = `https://registry.npmjs.org/@oh-my-pi/pi-natives-${tag}/-/pi-natives-${tag}-${VERSION}.tgz`;
// Extract next to the target (same filesystem): rename() fails across devices, e.g. tmpfs /tmp.
const work = join(dirname(target), `.native-download-${process.pid}`);
let message;
try {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const tarball = Buffer.from(await response.arrayBuffer());
	const digest = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
	if (digest !== spec.integrity) throw new Error("integrity mismatch");

	mkdirSync(work, { recursive: true });
	writeFileSync(join(work, "pkg.tgz"), tarball);
	execFileSync("tar", ["xzf", "pkg.tgz"], { cwd: work });
	mkdirSync(target, { recursive: true });
	const extracted = readdirSync(join(work, "package"));
	for (const file of spec.files) {
		if (!extracted.includes(file)) throw new Error(`${file} missing from package`);
		renameSync(join(work, "package", file), join(target, file));
	}
	renameSync(join(work, "package", "LICENSE"), join(target, "LICENSE"));
	message = `installed snapcompact renderer for ${tag} (@oh-my-pi/pi-natives-${tag}@${VERSION})`;
} catch (error) {
	message = `could not fetch snapcompact renderer (${error instanceof Error ? error.message : error}); snapcompact disabled`;
} finally {
	// Before done(): process.exit() would skip this.
	rmSync(work, { recursive: true, force: true });
}
done(message);
