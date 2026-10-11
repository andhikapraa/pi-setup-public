import { spawn } from "node:child_process";

export type ClipboardWriter = (secret: string) => Promise<void>;

export const writeMacOSClipboard: ClipboardWriter = async (secret) => {
  if (process.platform !== "darwin") {
    throw new Error("Axon secret delivery requires macOS /usr/bin/pbcopy");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/pbcopy", [], {
      stdio: ["pipe", "ignore", "ignore"],
      env: {},
    });
    child.once("error", () => reject(new Error("Could not start /usr/bin/pbcopy")));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pbcopy exited with status ${code ?? "unknown"}`));
    });
    child.stdin.once("error", () => reject(new Error("Could not write the Axon key to pbcopy")));
    child.stdin.end(secret, "utf8");
  });
};

export async function copySecretToClipboard(
  secret: string,
  writer: ClipboardWriter = writeMacOSClipboard,
): Promise<void> {
  if (!secret) throw new Error("Axon returned an empty API key");
  await writer(secret);
}
