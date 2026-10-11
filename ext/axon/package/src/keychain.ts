import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function agentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  return configured ? path.resolve(configured.replace(/^~(?=$|[\\/])/, os.homedir())) : path.join(os.homedir(), ".pi", "agent");
}

const HELPER_SOURCE = `import Foundation
import Security

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\\n").utf8))
  exit(1)
}

guard CommandLine.arguments.count == 4 else { fail("usage: axon-keychain <read|write> <service> <account>") }
let operation = CommandLine.arguments[1]
let service = CommandLine.arguments[2]
let account = CommandLine.arguments[3]
guard !service.isEmpty, !account.isEmpty else { fail("service and account are required") }
var query: [String: Any] = [
  kSecClass as String: kSecClassGenericPassword,
  kSecAttrService as String: service,
  kSecAttrAccount as String: account,
]

if operation == "read" {
  query[kSecReturnData as String] = true
  query[kSecMatchLimit as String] = kSecMatchLimitOne
  var result: CFTypeRef?
  let status = SecItemCopyMatching(query as CFDictionary, &result)
  guard status == errSecSuccess, let data = result as? Data else {
    fail("Keychain read failed with status \\(status)")
  }
  FileHandle.standardOutput.write(data)
} else if operation == "write" {
  let secret = FileHandle.standardInput.readDataToEndOfFile()
  guard !secret.isEmpty else { fail("secret is required") }
  var helperApplication: SecTrustedApplication?
  guard SecTrustedApplicationCreateFromPath(CommandLine.arguments[0], &helperApplication) == errSecSuccess,
        let helperApplication else { fail("Could not create Keychain trusted application") }
  var access: SecAccess?
  guard SecAccessCreate("Axon project key" as CFString, [helperApplication] as CFArray, &access) == errSecSuccess,
        let access else { fail("Could not create Keychain access policy") }
  SecItemDelete(query as CFDictionary)
  query[kSecValueData as String] = secret
  query[kSecAttrAccess as String] = access
  let status = SecItemAdd(query as CFDictionary, nil)
  guard status == errSecSuccess else { fail("Keychain add failed with status \\(status)") }
} else {
  fail("unsupported operation")
}
`;

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  input?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;

const runProcess: ProcessRunner = async (command, args, input) => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", () => reject(new Error(`Could not start ${path.basename(command)}`)));
    child.once("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(input ?? "", "utf8");
  });
};

function helperPaths(): { source: string; binary: string } {
  const directory = path.join(agentDir(), "cache", "pi-axon-ext");
  return {
    source: path.join(directory, "axon-keychain.swift"),
    binary: path.join(directory, "axon-keychain"),
  };
}

async function ensureHelper(runner: ProcessRunner): Promise<string> {
  const { source, binary } = helperPaths();
  mkdirSync(path.dirname(source), { recursive: true, mode: 0o700 });
  const currentSource = (() => {
    try { return readFileSync(source, "utf8"); } catch { return undefined; }
  })();
  const sourceChanged = currentSource !== HELPER_SOURCE;
  if (sourceChanged) writeFileSync(source, HELPER_SOURCE, { encoding: "utf8", mode: 0o600 });
  let binaryMissing = false;
  try { binaryMissing = !statSync(binary).isFile(); } catch { binaryMissing = true; }
  if (sourceChanged || binaryMissing) {
    const result = await runner("/usr/bin/swiftc", [source, "-o", binary]);
    if (result.code !== 0) throw new Error("Could not compile the Axon Keychain helper");
  }
  return binary;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function storeSecretInMacOSKeychain(
  secret: string,
  service: string,
  runner: ProcessRunner = runProcess,
): Promise<string> {
  if (process.platform !== "darwin") throw new Error("Project Axon keys require macOS Keychain");
  if (!secret.trim()) throw new Error("Axon returned an empty API key");
  if (!/^[A-Za-z0-9._:-]+$/.test(service)) throw new Error("Invalid Keychain service name");
  const binary = await ensureHelper(runner);
  const account = os.userInfo().username;
  const result = await runner(binary, ["write", service, account], secret);
  if (result.code !== 0) throw new Error("Could not store the Axon key in macOS Keychain");
  return `!${shellQuote(binary)} read ${shellQuote(service)} ${shellQuote(account)}`;
}
