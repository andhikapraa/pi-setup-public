---
name: android-rooted-avd
description: Build, root, inspect, recover, or manage an explicitly requested disposable Android emulator lab using rootAVD, Magisk, and source-pinned modules. Use only for explicit rooted AVD, rootAVD, Magisk-on-emulator, ReZygisk, Tricky Store, KernelSU WebUI, or Play Integrity test-lab requests. Ordinary Android SDK and emulator work belongs to android-cli.
metadata:
  adaptation: OMP
  risk: destructive-local-emulator
---

# Rooted Android Emulator Lab

This workflow is opt-in. It changes an emulator system image and may invalidate snapshots or every AVD that shares that image. Keep it separate from ordinary Android development.

## Boundary

- Read `../android-cli/SKILL.md` first for standard SDK, AVD, and device operations.
- Operate on a disposable local emulator unless the user names another exact target.
- Never root a physical device, production device, or daily-driver AVD without an explicit request naming that target.
- Before mutation, record the AVD name, system-image path, raw `ramdisk.img` SHA-256, and a restorable copy outside the SDK tree.
- Stop the emulator before replacing or restoring SDK image files.
- Do not promise any Play Integrity verdict. Google can change server-side evaluation independently of local modules.
- Do not source community keyboxes, device identities, or fingerprints. This package contains no such material.
- Do not install an unlisted binary. Exact source, version, URL, byte size, and SHA-256 must be present in `artifacts.json` or added through a deliberate provenance update first.
- The portable distribution contains metadata only. Download artifacts only during an explicit rooted-emulator request, into a task-scoped temporary directory, and verify SHA-256 before extraction or installation.

## Prepare the lab

1. Confirm `ANDROID_HOME`, `android`, `adb`, and the raw emulator binary.
2. List AVDs with `android emulator list` and devices with `adb devices -l`.
3. Prefer a new disposable AVD. Use a Play Store system image only when the requested test requires Play services.
4. Inspect the AVD configuration to resolve its exact system-image directory and `ramdisk.img`.
5. Copy `ramdisk.img` to a dated backup and hash both source and backup.
6. Start the raw emulator with `-writable-system -no-snapshot` as a managed long-running process. Wait for `sys.boot_completed=1` before continuing.

Example raw launch shape, after resolving paths and the AVD name:

```bash
"$ANDROID_HOME/emulator/emulator" @<AVD_NAME> -writable-system -no-snapshot
adb -s <SERIAL> wait-for-device
adb -s <SERIAL> shell getprop sys.boot_completed
```

Always include `-s <SERIAL>` once more than one device is visible.

## Acquire rootAVD

Use the `rootavd` record in `artifacts.json`:

1. Download the pinned archive to a task-scoped temporary directory.
2. Verify its byte size and SHA-256 exactly.
3. Extract it without writing into the OMP package.
4. Inspect `rootAVD.sh` and the upstream compatibility chart for the selected system image.
5. Resolve the system-image path relative to `$ANDROID_HOME`.

Run the pinned script with the selected image's `ramdisk.img` and `FAKEBOOTIMG`. The flow is interactive: Magisk opens in the emulator and asks the user to select and patch `fakeboot.img`. Use a PTY-managed process and surface the prompt. Do not bypass or fake the required UI step.

```bash
./rootAVD.sh system-images/android-<API>/<VARIANT>/<ARCH>/ramdisk.img FAKEBOOTIMG
```

After the script completes:

1. Stop the emulator cleanly.
2. Cold-start again with `-writable-system -no-snapshot`.
3. Complete any Magisk in-app setup and reboot it requests.
4. Verify root behavior, not merely process presence:

```bash
adb -s <SERIAL> shell 'su -c id'
```

Expected evidence includes `uid=0(root)`. If root fails, stop and recover instead of layering modules over a broken base.

## Install pinned modules

Only install a module when the user explicitly asks for that capability. Select the exact record from `artifacts.json`, download to the task directory, and verify SHA-256 before pushing it.

```bash
adb -s <SERIAL> push <verified-module.zip> /sdcard/Download/
adb -s <SERIAL> shell 'su -c "magisk --install-module /sdcard/Download/<module.zip>"'
adb -s <SERIAL> reboot
```

After reboot, wait for full boot and verify both root and module state under `/data/adb/modules`.

Module-specific constraints:

- **ReZygisk:** Magisk's built-in Zygisk conflicts with ReZygisk. Disable built-in Zygisk through the Magisk UI, reboot, then install ReZygisk.
- **Tricky Store:** Changes key-attestation behavior. Use only in an authorized test lab. Do not add third-party keyboxes.
- **Strong Integrity Fix:** Its repository has no observed license file. It is not redistributed. Installation does not guarantee a server-side verdict.
- **KsuWebUIStandalone:** This is an APK for KernelSU module management, not a Magisk module. Do not install it in a Magisk-only lab.

## Disable or remove a module

Prefer reversible state first:

```bash
adb -s <SERIAL> shell 'su -c "touch /data/adb/modules/<module-id>/disable"'
adb -s <SERIAL> reboot
```

For requested removal, mark it for removal on next reboot:

```bash
adb -s <SERIAL> shell 'su -c "touch /data/adb/modules/<module-id>/remove"'
adb -s <SERIAL> reboot
```

Do not delete module directories directly unless reversible removal cannot boot and the user explicitly authorizes the recovery action.

## Recovery

If patching or a module breaks boot:

1. Stop the emulator process.
2. Restore the verified original `ramdisk.img` backup while the emulator is stopped.
3. Cold-start with snapshots disabled.
4. If the AVD still fails, recreate the disposable AVD from the same pinned system image rather than mutating unrelated AVDs.
5. Re-run root verification and record the recovery result.

If no trusted backup exists, reinstall the exact system-image package through `android sdk` after naming the shared-image blast radius. Reinstallation can affect every AVD using that image.

## Evidence

For every rooted flow, report:

- AVD name, serial, API, variant, and architecture.
- rootAVD commit and archive SHA-256.
- Original and patched `ramdisk.img` SHA-256.
- Each installed artifact's version and verified SHA-256.
- `su -c id` result and installed module IDs after the final reboot.
- Backup location and recovery procedure.
