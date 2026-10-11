---
name: android-cli
description: Use Android's official `android` CLI for current project creation, SDK package and emulator management, build and deploy, documentation lookup, screenshots, layout inspection, journey tests, and ordinary ADB interaction. Use for Android CLI, Android SDK, AVD, emulator, or adb requests. Rooted emulator, Magisk, and integrity-module work belongs to android-rooted-avd.
license: Complete terms in LICENSE.txt
metadata:
  author: Google LLC
  adaptation: OMP
  source-commit: ea05a53683d1fb1fc701c3ad91f494d25d4fc7c6
---

# Android CLI

Use the official `android` CLI as the primary interface for standard Android development. This OMP adaptation is pinned to Google's `android/skills` source and keeps OMP, not Android CLI, responsible for agent skills and configuration.

## Ownership and safety

- Use `android` for supported SDK, project, emulator, install, run, documentation, screen, and layout operations.
- Use `adb` and the raw `emulator` binary for low-level device operations and launch flags that Android CLI does not expose.
- Use `sdkmanager` or `avdmanager` only as a named temporary fallback after `android help <group>` and current leaf-command usage confirm the required operation is missing.
- Never run `android init`. It writes Android CLI configuration and skills outside OMP's canonical package.
- Never run `android skills add` or `android skills remove`. OMP owns skill installation and updates.
- Never run `android update` automatically. Update the CLI only when the user explicitly requests that update.
- Never pipe an installer into a shell. On an explicit installation request, download the official platform installer to a temporary file, inspect its source and target, then execute that file.
- Use `ANDROID_HOME`. Do not add `ANDROID_SDK_ROOT`; Google marks it deprecated.
- Do not update every installed SDK package unless the user explicitly requests a full SDK update. Prefer named package installs and updates.
- For a rooted emulator, Magisk, rootAVD, Tricky Store, or Play Integrity module request, read `../android-rooted-avd/SKILL.md` and keep this skill limited to standard setup and device control.

## Establish current state

Run only the checks needed for the request:

```bash
android --version
android info
android sdk list --all
android emulator list
adb devices -l
```

If the SDK is not at the expected location, pass `--sdk=<path>` or set `ANDROID_HOME` for the current environment. Do not silently rewrite shell startup files.

If `android` is absent, use the official installation page at <https://developer.android.com/tools/agents/android-cli>. Installation changes the machine and requires an explicit installation request.

## SDK management

Android CLI uses slash-separated package names rather than legacy semicolon coordinates:

```bash
android sdk list --all
android sdk install platforms/android-36
android sdk install system-images/android-36/google_apis_playstore/arm64-v8a
android sdk update platforms/android-36
android sdk remove platforms/android-36
```

Use `android help sdk` for group capability discovery. The preview CLI currently prints valid group help but exits with status 1; inspect the usage output rather than treating that status alone as failure. A package may include `@<version>`.

Choose system images by the observed host architecture and test requirement. `google_apis_playstore` is appropriate only when Play Store behavior is required; prefer a smaller image otherwise.

## Projects and applications

```bash
android create --list
android create empty-activity --name="My App" --output=./my-app
android describe --project_dir=./my-app
android run --device=<serial>
android install --device=<serial> --apks=app.apk
```

Before creating files, inspect the destination and use the repository's existing project conventions. Before build or deploy, run the repository-local build toolchain rather than replacing it with a generated project.

## Emulators

Use current command help as the syntax authority. Group help currently exits with status 1 after printing valid usage; leaf help uses `-h`:

```bash
android help emulator
android emulator create -h
android emulator list
android emulator start <name>
android emulator stop <name>
android emulator remove <name>
```

`android emulator remove` deletes local AVD state. Run it only when the user explicitly asks to delete that AVD.

For raw launch flags such as `-writable-system`, `-no-snapshot`, `-no-window`, or GPU selection, resolve `$ANDROID_HOME/emulator/emulator` and launch it as a managed long-running process. Do not background it through an unmanaged shell command.

## Device inspection and interaction

Use Android CLI where it adds structure:

```bash
android layout --pretty
android layout --diff
android screen capture -o screen.png
android docs search "<keywords>"
android docs fetch <kb-url>
```

Use `adb` for low-level operations such as shell commands, input, file transfer, package state, logcat, port forwarding, and device properties. Always target an explicit serial when more than one device is connected.

Read [references/interact.md](references/interact.md) before driving a device UI. Read [references/journeys.md](references/journeys.md) before authoring or running a journey test.

## Documentation rule

For Android-specific APIs, migrations, platform behavior, or current best practices, prefer `android docs search` and `android docs fetch`. If Android Knowledge Base results do not cover the question, use current official Android documentation through the normal research workflow.

## Compatibility fallback

The Android CLI is still a preview surface and does not expose every legacy operation. A fallback is valid only when all are true:

1. Current `android help` or subcommand help lacks the needed operation.
2. The fallback is scoped to that one operation.
3. The response names the legacy tool and why it is required.
4. Standard work returns to `android` immediately afterward.

Typical valid fallbacks are advanced AVD configuration through `avdmanager`, raw emulator flags through the `emulator` binary, and low-level device control through `adb`.
