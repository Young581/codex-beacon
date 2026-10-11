#!/usr/bin/env python3
"""Codex hook event spool, read by the VS Code workspace extension.

Run install and hooks under the same OS user as the remote Codex process.
Only notification metadata is stored; prompts and command arguments are omitted.
"""

import argparse
import base64
import contextlib
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import shlex
import re
import shutil
import socket
import sqlite3
import stat
import subprocess
import sys
import time
import uuid


OWNER = "codex-beacon-v1"
DIRECTORY_NAME = "codex-beacon"
MAX_INPUT_BYTES = 1024 * 1024
MAX_EVENT_BYTES = 4096
MAX_LOG_BYTES = 5 * 1024 * 1024
REPLAY_BYTES = 128 * 1024
MAX_BATCH_BYTES = 512 * 1024
ROLLOUT_TAIL_BYTES = 256 * 1024
MAX_ROLLOUT_FILES = 64
MAX_METADATA_BYTES = 1024 * 1024
MAX_SOURCE_INDEX_FILES = 10000
MAX_TITLE_INDEX_BYTES = 8 * 1024 * 1024
SOURCE_FILTER_VERSION = 1
# Verified in openai.chatgpt 26.901.22334: the native and WSL app-server
# launchers both set CODEX_INTERNAL_ORIGINATOR_OVERRIDE to this exact value.
# Desktop sessions also use source="vscode", so that field is not sufficient.
VSCODE_ORIGINATORS = frozenset(("codex_vscode",))
EVENT_TYPES = {"done", "approval", "question", "test", "heartbeat", "task"}
DEFAULT_RETENTION_DAYS = 7
PRIVACY_FILE = "privacy-reset.json"
PRIVACY_LOCK = ".privacy.lock"
BACKUP_LEDGER = "backup-ledger.json"
OWNED_CACHE_NAMES = {"events.jsonl", "events.jsonl.1", "config.json", "remote_notifier.py",
                     ".install.lock", ".events.lock", BACKUP_LEDGER}
BACKUP_NAME = re.compile(r"hooks\.json\.bak-codex-beacon-\d{8}-\d{6}-[0-9a-f]{32}$")


def reject_links(path):
    for component in reversed((path, *path.parents)):
        try:
            info = component.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
            raise ValueError("privacy operation refuses symbolic links or reparse points")
        if stat.S_ISREG(info.st_mode) and info.st_nlink > 1:
            raise ValueError("privacy operation refuses multiply-linked files")


def safe_home(value):
    home = Path(value).expanduser().absolute()
    reject_links(home)
    home = home.resolve()
    if home == Path(home.anchor) or home == Path.home().resolve():
        raise ValueError("Codex home must be a dedicated directory, not a filesystem or user-home root")
    if home.exists() and not home.is_dir():
        raise ValueError("Codex home must be a directory")
    return home


def safe_path(home, relative):
    fragment = Path(relative)
    if fragment.is_absolute() or ".." in fragment.parts:
        raise ValueError("privacy target must remain inside the selected Codex home")
    candidate = home / fragment
    reject_links(candidate)
    candidate.resolve().relative_to(home)
    return candidate


def bounded_json(path, default, limit=MAX_INPUT_BYTES):
    if not path.exists():
        return default
    if path.stat().st_size > limit:
        raise ValueError("notification configuration exceeds the read limit")
    return json.loads(path.read_text(encoding="utf-8-sig"))


def privacy_state(home):
    try:
        state = bounded_json(safe_path(home, DIRECTORY_NAME + "/" + PRIVACY_FILE), {})
        if not isinstance(state, dict):
            raise ValueError("invalid privacy control state")
        if state and (state.get("version") != 1 or not isinstance(state.get("paused"), bool) or "cutoff" not in state):
            raise ValueError("invalid privacy control state")
        cutoff = state.get("cutoff", 0)
        if not isinstance(cutoff, (int, float)) or isinstance(cutoff, bool) or not math.isfinite(cutoff):
            raise ValueError("invalid privacy cutoff")
        return {"paused": state.get("paused") is True, "cutoff": max(0, cutoff)}
    except (ValueError, OSError):
        return {"paused": True, "cutoff": time.time(), "invalid": True}


def privacy_lock(home):
    return locked(safe_path(home, DIRECTORY_NAME + "/" + PRIVACY_LOCK))


@contextlib.contextmanager
def spool_lock(home):
    with privacy_lock(home):
        if privacy_state(home)["paused"]:
            yield False
        else:
            with locked(safe_path(home, DIRECTORY_NAME + "/.events.lock")):
                yield True


def retention_days(value):
    if isinstance(value, bool):
        raise ValueError("retention days must be an integer between 1 and 30")
    result = int(value)
    if result != float(value) or not 1 <= result <= 30:
        raise ValueError("retention days must be an integer between 1 and 30")
    return result


def guarded_command(function):
    def run(args):
        # Validate the original spelling before resolve could hide symlinks.
        home = safe_home(args.codex_home or codex_home())
        args.codex_home = str(home)
        with privacy_lock(home):
            return function(args)
    return run


def codex_home(value=None):
    if value:
        return Path(value).expanduser().resolve()
    installed_directory = Path(__file__).resolve().parent
    if installed_directory.name == DIRECTORY_NAME and (installed_directory / "config.json").is_file():
        return installed_directory.parent
    return Path(os.environ.get("CODEX_HOME") or "~/.codex").expanduser().resolve()


def make_directory(path):
    # Windows inherits the user's directory ACL; POSIX gets owner-only access.
    path.mkdir(mode=0o777 if os.name == "nt" else 0o700, parents=True, exist_ok=True)


@contextlib.contextmanager
def locked(path):
    """A stable sidecar lock also protects event-log rename/rotation."""
    reject_links(path)
    make_directory(path.parent)
    descriptor = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o600)
    stream = os.fdopen(descriptor, "r+b", buffering=0)
    try:
        if os.name == "nt":
            import msvcrt
            if os.fstat(stream.fileno()).st_size == 0:
                try:
                    stream.write(b"\0")
                except OSError:
                    # Another process can initialize and lock byte zero between
                    # the size check and this write. Lock acquisition below waits.
                    pass
            stream.seek(0)
            while True:
                try:
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    time.sleep(0.01)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        try:
            if os.name == "nt":
                import msvcrt
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
        finally:
            stream.close()


def atomic_write(path, data):
    reject_links(path)
    make_directory(path.parent)
    temporary = path.with_name(path.name + ".tmp-" + uuid.uuid4().hex)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o600
    descriptor = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(str(temporary), str(path))
    finally:
        if temporary.exists():
            temporary.unlink()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def read_json(path, default):
    if not path.exists():
        return default
    with path.open("r", encoding="utf-8-sig") as stream:
        return json.load(stream)


def backup(path):
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    home = safe_home(path.parent)
    destination = safe_path(home, "hooks.json.bak-codex-beacon-" + stamp + "-" + uuid.uuid4().hex)
    ledger_path = safe_path(home, DIRECTORY_NAME + "/" + BACKUP_LEDGER)
    ledger = bounded_json(ledger_path, {"version": 1, "owner": OWNER, "files": []})
    if not isinstance(ledger, dict) or ledger.get("owner") != OWNER or not isinstance(ledger.get("files"), list):
        raise ValueError("backup ledger is invalid; existing backups were preserved")
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("hooks.json exceeds the backup size limit")
    content = path.read_bytes()
    ledger["files"].append({"path": destination.name, "sha256": hashlib.sha256(content).hexdigest(), "createdAt": time.time()})
    # Record the exact planned name/hash first so a later failed copy cannot
    # leave a new full hooks backup with unrecorded ownership.
    atomic_write(ledger_path, json_bytes(ledger))
    atomic_write(destination, content)
    return str(destination)


def is_owned_hook(hook):
    if not isinstance(hook, dict) or hook.get("type") != "command":
        return False
    try:
        parts = shlex.split(hook.get("command", ""))
        index = parts.index("--owner")
        return parts[index + 1] == OWNER
    except (ValueError, IndexError, TypeError):
        return False


def remove_owned_hooks(document):
    """Remove our individual commands, preserving unrelated wrapper contents."""
    events = document.get("hooks", {})
    if not isinstance(events, dict):
        raise ValueError("hooks.json 'hooks' must be an object; no files were changed")
    for event, entries in list(events.items()):
        if not isinstance(entries, list):
            raise ValueError("hooks.json event entries must be arrays; no files were changed")
        kept_entries = []
        for entry in entries:
            if isinstance(entry, dict) and isinstance(entry.get("hooks"), list):
                kept_hooks = [hook for hook in entry["hooks"] if not is_owned_hook(hook)]
                if len(kept_hooks) != len(entry["hooks"]):
                    if kept_hooks:
                        replacement = dict(entry)
                        replacement["hooks"] = kept_hooks
                        kept_entries.append(replacement)
                    continue
            kept_entries.append(entry)
        if kept_entries:
            events[event] = kept_entries
        elif entries:
            del events[event]


def configured_hooks(home):
    script = home / DIRECTORY_NAME / "remote_notifier.py"
    arguments = [sys.executable, str(script), "hook", "--codex-home", str(home), "--owner", OWNER]
    command = (subprocess.list2cmdline(arguments) if os.name == "nt"
               else " ".join(shlex.quote(argument) for argument in arguments))
    events = {}
    for event, event_type in (("PermissionRequest", "approval"),):
        entry = {"hooks": [{"type": "command", "command": command + " --event " + event_type,
                            "timeout": 3, "async": True}]}
        if os.name == "nt":
            # An explicit call operator works with executable paths containing
            # spaces. Encoding also preserves quoting through the hook shell.
            powershell_call = "& " + " ".join("'" + argument.replace("'", "''") + "'"
                                              for argument in arguments + ["--event", event_type])
            encoded = base64.b64encode(powershell_call.encode("utf-16le")).decode("ascii")
            entry["hooks"][0]["commandWindows"] = (
                "powershell.exe -NoProfile -NonInteractive -EncodedCommand " + encoded)
        events[event] = entry
    return events


@guarded_command
def install(args):
    home = codex_home(args.codex_home)
    automatic = getattr(args, "if_missing", False)
    if automatic and privacy_state(home)["paused"]:
        print(json.dumps({"installed": False, "paused": True}))
        return
    directory = home / DIRECTORY_NAME
    make_directory(directory)
    with locked(directory / ".install.lock"):
        hooks_path = safe_path(home, "hooks.json")
        original = read_json(hooks_path, {})
        if not isinstance(original, dict):
            raise ValueError("hooks.json must be a JSON object; no files were changed")
        updated = json.loads(json.dumps(original))
        remove_owned_hooks(updated)
        if automatic:
            permission_entries = original.get("hooks", {}).get("PermissionRequest", [])
            if any(isinstance(entry, dict) and isinstance(entry.get("hooks"), list) and
                   any(is_owned_hook(hook) for hook in entry["hooks"]) for entry in permission_entries):
                print(json.dumps({"installed": False, "already_configured": True}))
                return
            # Automatic setup appends only the missing approval definition.
            # Leave existing Beacon definitions for other events untouched too.
            updated = json.loads(json.dumps(original))
        events = updated.setdefault("hooks", {})
        for event, entry in configured_hooks(home).items():
            events.setdefault(event, []).append(entry)
        old_config = read_json(directory / "config.json", {})
        if not isinstance(old_config, dict):
            raise ValueError("codex-beacon/config.json must be a JSON object; no files were changed")
        configuration = dict(old_config)
        configuration["version"] = 1
        configuration["retentionDays"] = retention_days(args.retention_days)
        configuration["label"] = clean_text(
            args.label if args.label is not None else old_config.get("label", socket.gethostname()), 200
        )
        script_source = Path(__file__).resolve()
        script_target = directory / "remote_notifier.py"
        if script_source != script_target.resolve():
            source_bytes = script_source.read_bytes()
            if not script_target.exists() or script_target.read_bytes() != source_bytes:
                atomic_write(script_target, source_bytes)
        if configuration != old_config:
            atomic_write(directory / "config.json", json_bytes(configuration))
        saved_backup = None
        if original != updated:
            if hooks_path.exists():
                saved_backup = backup(hooks_path)
            atomic_write(hooks_path, json_bytes(updated))
    print(json.dumps({"installed": True, "codex_home": str(home),
                      "installed_script": str(script_target), "hook_count": 1,
                      "label": configuration["label"], "hooks_backup": saved_backup}, ensure_ascii=False))


@guarded_command
def uninstall(args):
    home = codex_home(args.codex_home)
    path = safe_path(home, "hooks.json")
    if not path.exists():
        print('{"uninstalled":true,"changed":false}')
        return
    with locked(home / DIRECTORY_NAME / ".install.lock"):
        original = read_json(path, {})
        if not isinstance(original, dict):
            raise ValueError("hooks.json must be a JSON object; no files were changed")
        updated = json.loads(json.dumps(original))
        remove_owned_hooks(updated)
        changed = updated != original
        saved_backup = backup(path) if changed else None
        if changed:
            atomic_write(path, json_bytes(updated))
    print(json.dumps({"uninstalled": True, "changed": changed, "hooks_backup": saved_backup}))


def clean_text(value, limit):
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        return ""
    # Strip terminal control characters, preserving human-readable Unicode labels.
    return "".join(character for character in str(value) if character.isprintable())[:limit]


def event_record(home, event_type, payload=None, *, verified_originator=None):
    if event_type not in EVENT_TYPES:
        raise ValueError("unsupported notification event")
    payload = payload or {}
    try:
        config = bounded_json(safe_path(home, DIRECTORY_NAME + "/config.json"), {})
    except (ValueError, OSError):
        config = {}
    if not isinstance(config, dict):
        config = {}
    record = {
        "version": 1, "type": event_type, "id": uuid.uuid4().hex, "timestamp": time.time(),
        "host": clean_text(socket.gethostname(), 128),
        "label": clean_text(config.get("label", socket.gethostname()), 200),
        "cwd": clean_text(payload.get("cwd", ""), 512),
        "session_id": clean_text(payload.get("session_id", payload.get("thread_id", "")), 128),
        "turn_id": clean_text(payload.get("turn_id", ""), 128),
    }
    if event_type not in ("test", "heartbeat") and verified_originator == "codex_vscode":
        record["originator"] = verified_originator
    encoded = (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    # Worst-case multi-byte strings are clipped further to keep each record bounded.
    if len(encoded) > MAX_EVENT_BYTES:
        for key in ("cwd", "label", "session_id", "turn_id", "host"):
            record[key] = record[key][:80]
        encoded = (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if len(encoded) > MAX_EVENT_BYTES:
        raise ValueError("notification event exceeds size limit")
    return record, encoded


def append_event(home, event_type, payload=None, *, verified_originator=None, retention=None):
    home = safe_home(home)
    with privacy_lock(home):
        if privacy_state(home)["paused"]:
            return None
        record = append_event_unlocked(home, event_type, payload, verified_originator=verified_originator)
        try:
            config = bounded_json(safe_path(home, DIRECTORY_NAME + "/config.json"), {})
            days = retention_days(config.get("retentionDays", DEFAULT_RETENTION_DAYS)) if isinstance(config, dict) else DEFAULT_RETENTION_DAYS
        except (ValueError, OSError, TypeError):
            days = DEFAULT_RETENTION_DAYS
    if retention is not None:
        days = retention_days(retention)
    prune_notification_cache(home, days)
    return record


def append_event_unlocked(home, event_type, payload=None, *, verified_originator=None):
    record, encoded = event_record(home, event_type, payload, verified_originator=verified_originator)
    directory = home / DIRECTORY_NAME
    make_directory(directory)
    path = safe_path(home, DIRECTORY_NAME + "/events.jsonl")
    with locked(directory / ".events.lock"):
        if path.exists() and path.stat().st_size + len(encoded) > MAX_LOG_BYTES:
            os.replace(str(path), str(directory / "events.jsonl.1"))
        descriptor = os.open(str(path), os.O_APPEND | os.O_WRONLY | os.O_CREAT, 0o600)
        with os.fdopen(descriptor, "ab") as stream:
            stream.write(encoded)
            stream.flush()
    return record


def hook(args):
    """Never approve, deny, block, or otherwise control a Codex operation."""
    try:
        incoming = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(incoming) > MAX_INPUT_BYTES:
            raise ValueError("hook input exceeds 1 MiB")
        payload = json.loads(incoming.decode("utf-8")) if incoming.strip() else {}
        if not isinstance(payload, dict):
            raise ValueError("hook input must be a JSON object")
        event_type = args.event
        if event_type == "question" and payload.get("tool_name") not in (
                "request_user_input", "request_user_input_async"):
            return
        home = codex_home(args.codex_home)
        if SessionSources(home).allows(event_type, payload):
            append_event(home, event_type, payload, verified_originator="codex_vscode")
    except Exception as error:
        # Avoid echoing payloads, prompts, commands, or exception text containing them.
        print("codex-beacon: hook notification failed ({}); Codex may continue".format(
            type(error).__name__), file=sys.stderr)
    finally:
        print("{}", flush=True)


def valid_line(line, cutoff=None):
    if not line or len(line) > MAX_EVENT_BYTES:
        return None
    try:
        record = json.loads(line)
        if not isinstance(record, dict) or record.get("version") != 1:
            return None
        if record.get("type") not in EVENT_TYPES or not isinstance(record.get("id"), str):
            return None
        timestamp = record.get("timestamp")
        if not isinstance(timestamp, (int, float)) or isinstance(timestamp, bool):
            return None
        if not math.isfinite(timestamp):
            return None
        if cutoff is not None and timestamp < cutoff:
            return None
        # Reconstruct a metadata-only record; do not relay unexpected private fields.
        return {"version": 1, "type": record["type"], "id": clean_text(record["id"], 128),
                "timestamp": timestamp,
                **{key: clean_text(record.get(key, ""), limit) for key, limit in (
                    ("host", 128), ("label", 200), ("cwd", 512),
                    ("session_id", 128), ("turn_id", 128))}}
    except (ValueError, UnicodeDecodeError, TypeError):
        return None


def file_digest(path):
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("notification cleanup preview refuses files larger than 16 MiB")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def privacy_plan(home, days=DEFAULT_RETENTION_DAYS):
    home = safe_home(home)
    directory = safe_path(home, DIRECTORY_NAME)
    files = []
    limitations = ["Logical deletion is not secure erasure; filesystem snapshots, OS caches and external backups are outside this cleanup.",
                   "privacy-reset.json and .privacy.lock remain as minimal pause/cutoff control state.",
                   "Older collectors that do not support the privacy marker must be stopped or reloaded separately."]
    def add(relative, kind):
        target = safe_path(home, relative)
        info = target.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise ValueError("an allowlisted cleanup target is not a regular file")
        if len(files) >= 128:
            raise ValueError("too many notification files for a bounded cleanup preview")
        files.append({"relativePath": str(Path(relative).as_posix()), "bytes": info.st_size,
                      "kind": kind, "sha256": None if kind == "lock" else file_digest(target)})
    if directory.exists():
        for target in directory.iterdir():
            name = target.name
            if name in OWNED_CACHE_NAMES or re.fullmatch(
                    r"(?:events\.jsonl(?:\.1)?|config\.json|remote_notifier\.py|backup-ledger\.json)\.tmp-[0-9a-f]{32}", name):
                add(DIRECTORY_NAME + "/" + name, "lock" if name.endswith(".lock") else "notifier-cache")
            elif name == "__pycache__":
                cache = safe_path(home, DIRECTORY_NAME + "/__pycache__")
                if not cache.is_dir():
                    raise ValueError("notification bytecode cache is not a directory")
                for bytecode in cache.iterdir():
                    if re.fullmatch(r"remote_notifier\.cpython-\d+(?:\.opt-\d+)?\.pyc", bytecode.name):
                        add(DIRECTORY_NAME + "/__pycache__/" + bytecode.name, "notifier-bytecode")
            elif name not in (PRIVACY_FILE, PRIVACY_LOCK):
                limitations.append("Unrecognized files in the notifier directory are retained.")
    tracked = []
    ledger_path = safe_path(home, DIRECTORY_NAME + "/" + BACKUP_LEDGER)
    try:
        ledger = bounded_json(ledger_path, {"owner": OWNER, "files": []})
        if not isinstance(ledger, dict) or ledger.get("owner") != OWNER or not isinstance(ledger.get("files"), list):
            raise ValueError("invalid ledger")
        for entry in ledger["files"]:
            if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not BACKUP_NAME.fullmatch(entry["path"]):
                continue
            target = safe_path(home, entry["path"])
            if target.is_file() and file_digest(target) == entry.get("sha256"):
                add(entry["path"], "tracked-hook-backup")
                tracked.append(entry["path"])
    except (ValueError, OSError):
        limitations.append("Backup ownership could not be fully verified; unproven backups are retained.")
    legacy_count = sum(1 for item in home.iterdir() if item.name.startswith("hooks.json.bak-") and item.name not in tracked) if home.exists() else 0
    if legacy_count:
        limitations.append("Unproven legacy hooks.json backups are retained because they may belong to other tools.")
    hooks_path = safe_path(home, "hooks.json")
    hook_hash = file_digest(hooks_path) if hooks_path.exists() else None
    original = None
    updated = None
    hook_error = None
    try:
        original = bounded_json(hooks_path, {})
        if not isinstance(original, dict):
            raise ValueError("hooks.json must be an object")
        updated = json.loads(json.dumps(original))
        remove_owned_hooks(updated)
    except (ValueError, OSError):
        hook_error = "hooks.json is invalid or unreadable; cleanup cannot safely remove only the managed hook."
        limitations.append(hook_error)
    state = privacy_state(home)
    files.sort(key=lambda item: item["relativePath"])
    material = {"home": str(home), "files": [item for item in files if item["kind"] != "lock"], "hooks": hook_hash}
    token = hashlib.sha256(json.dumps(material, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    result = {"version": 1, "codexHome": str(home), "notifierDirectory": str(directory),
              "retentionDays": retention_days(days), "paused": state["paused"], "resetCutoff": state["cutoff"],
              "files": files, "totalBytes": sum(item["bytes"] for item in files),
              "managedHookConfigured": original != updated if hook_error is None else None,
              "trackedBackups": tracked, "legacyBackupCount": legacy_count,
              "limitations": list(dict.fromkeys(limitations)), "canClear": hook_error is None,
              "previewToken": token}
    return result, original, updated


def privacy_status(args):
    home = safe_home(args.codex_home or codex_home())
    print(json.dumps(privacy_plan(home, args.retention_days)[0], ensure_ascii=False))


def preview_privacy_cleanup(args):
    privacy_status(args)


def clear_private_data(args):
    home = safe_home(args.codex_home or codex_home())
    with privacy_lock(home):
        directory = safe_path(home, DIRECTORY_NAME)
        with locked(safe_path(home, DIRECTORY_NAME + "/.install.lock")), locked(safe_path(home, DIRECTORY_NAME + "/.events.lock")):
            preview, original, updated = privacy_plan(home, args.retention_days)
            if preview["previewToken"] != args.preview_token:
                raise ValueError("notification files changed; preview privacy cleanup again before clearing")
            if not preview["canClear"]:
                raise ValueError("hooks.json is invalid; no notification data was deleted")
            cutoff = time.time()
            atomic_write(safe_path(home, DIRECTORY_NAME + "/" + PRIVACY_FILE),
                         json_bytes({"version": 1, "paused": True, "cutoff": cutoff}))
            if original != updated:
                # Cleanup deliberately creates no new full hooks.json backup.
                atomic_write(safe_path(home, "hooks.json"), json_bytes(updated))
            removed = 0
            removed_bytes = 0
            errors = []
            ordered = sorted(preview["files"], key=lambda item: item["relativePath"].endswith(BACKUP_LEDGER))
            for item in ordered:
                if item["kind"] == "lock":
                    continue
                if item["relativePath"].endswith(BACKUP_LEDGER) and errors:
                    continue
                try:
                    safe_path(home, item["relativePath"]).unlink()
                    removed += 1
                    removed_bytes += item["bytes"]
                except OSError:
                    errors.append("An owned notification file could not be removed; the collector remains paused.")
        for name in (".install.lock", ".events.lock"):
            try:
                target = safe_path(home, DIRECTORY_NAME + "/" + name)
                size = target.stat().st_size
                target.unlink()
                removed += 1
                removed_bytes += size
            except FileNotFoundError:
                pass
            except OSError:
                errors.append("A notifier lock file could not be removed; the collector remains paused.")
        cache = safe_path(home, DIRECTORY_NAME + "/__pycache__")
        if cache.is_dir():
            try:
                cache.rmdir()
            except OSError:
                pass
        preview.update({"cleared": not errors, "paused": True, "resetCutoff": cutoff,
                        "deletedCount": removed, "deletedBytes": removed_bytes,
                        "managedHookRemoved": original != updated, "errors": list(dict.fromkeys(errors))})
        print(json.dumps(preview, ensure_ascii=False))


@guarded_command
def resume_private_data(args):
    home = safe_home(args.codex_home)
    state = privacy_state(home)
    atomic_write(safe_path(home, DIRECTORY_NAME + "/" + PRIVACY_FILE),
                 json_bytes({"version": 1, "paused": False, "cutoff": state["cutoff"]}))
    print(json.dumps({"resumed": True, "paused": False, "resetCutoff": state["cutoff"]}))


def prune_notification_cache(home, days=DEFAULT_RETENTION_DAYS):
    home = safe_home(home)
    with spool_lock(home) as active:
        if not active:
            return
        cutoff = max(time.time() - retention_days(days) * 86400, privacy_state(home)["cutoff"])
        for name in ("events.jsonl", "events.jsonl.1"):
            target = safe_path(home, DIRECTORY_NAME + "/" + name)
            if not target.exists():
                continue
            retained = bytearray()
            with target.open("rb") as stream:
                while True:
                    line = stream.readline(MAX_EVENT_BYTES + 1)
                    if not line:
                        break
                    oversized = len(line) > MAX_EVENT_BYTES
                    while line and not line.endswith(b"\n"):
                        line = stream.readline(MAX_EVENT_BYTES + 1)
                        oversized = True
                    record = None if oversized else valid_line(line, cutoff)
                    if record is not None:
                        if json.loads(line).get("originator") == "codex_vscode":
                            record["originator"] = "codex_vscode"
                        encoded = (json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
                        if len(retained) + len(encoded) <= MAX_LOG_BYTES:
                            retained.extend(encoded)
            if retained:
                if target.stat().st_size != len(retained) or file_digest(target) != hashlib.sha256(retained).hexdigest():
                    atomic_write(target, bytes(retained))
            else:
                target.unlink()


def store_retention_policy(home, days):
    with privacy_lock(home):
        if privacy_state(home)["paused"]:
            return
        with locked(safe_path(home, DIRECTORY_NAME + "/.install.lock")):
            target = safe_path(home, DIRECTORY_NAME + "/config.json")
            try:
                config = bounded_json(target, {})
            except (ValueError, OSError):
                return  # Do not overwrite a damaged config merely to save policy.
            if isinstance(config, dict) and config.get("retentionDays") != days:
                atomic_write(target, json_bytes({**config, "version": 1, "retentionDays": retention_days(days)}))


def emit(record):
    print(json.dumps(record, ensure_ascii=False, separators=(",", ":")), flush=True)


def emit_live(home, record):
    with privacy_lock(home):
        state = privacy_state(home)
        if record["type"] == "heartbeat":
            record["privacyPaused"] = state["paused"]
            emit(record)
        elif not state["paused"] and record["timestamp"] > state["cutoff"]:
            emit(record)


def identity(file_stat):
    return file_stat.st_dev, file_stat.st_ino


def read_chunk(path, offset, limit):
    """Read complete lines with a hard memory bound; skip oversized damaged lines."""
    with path.open("rb") as stream:
        stream.seek(offset)
        data = stream.read(limit)
        if not data:
            return b"", offset
        end = data.rfind(b"\n")
        if end < 0:
            # A full oversized chunk cannot contain a valid event; consume it.
            return b"", offset + len(data) if len(data) == limit else offset
        return data[:end + 1], offset + end + 1


def rollout_timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


TOKEN_FIELDS = {"input": "input_tokens", "cachedInput": "cached_input_tokens",
                "cacheWrite": "cache_write_input_tokens", "output": "output_tokens",
                "reasoningOutput": "reasoning_output_tokens"}


def token_usage(value):
    if not isinstance(value, dict) or not all(key in value for key in ("input_tokens", "output_tokens")):
        return None
    result = {}
    for key, field in TOKEN_FIELDS.items():
        count = value.get(field, 0)
        if not isinstance(count, int) or isinstance(count, bool) or not 0 <= count <= 10 ** 12:
            return None
        result[key] = count
    if result["cachedInput"] + result["cacheWrite"] > result["input"] or result["reasoningOutput"] > result["output"]:
        return None
    return result


def session_metadata(path):
    """Read only the bounded first session_meta line, retaining no prompt text."""
    try:
        with path.open("rb") as stream:
            first = stream.readline(MAX_METADATA_BYTES + 1)
        if len(first) > MAX_METADATA_BYTES:
            return None
        record = json.loads(first)
        if not isinstance(record, dict) or record.get("type") != "session_meta":
            return None
        payload = record.get("payload")
        if not isinstance(payload, dict) or not isinstance(payload.get("id"), str):
            return None
        originator = payload.get("originator")
        return {"session_id": payload["id"], "cwd": clean_text(payload.get("cwd", ""), 512),
                "originator": originator if isinstance(originator, str) else None,
                "subagent": isinstance(payload.get("source"), dict) and "subagent" in payload["source"]}
    except (OSError, ValueError, UnicodeDecodeError):
        return None


def vscode_source(metadata):
    originator = metadata.get("originator") if metadata else None
    return isinstance(originator, str) and originator in VSCODE_ORIGINATORS


class SessionSources:
    """Verify hook/spool provenance from rollout metadata, never event claims.

    The index contains filenames only. Metadata reads are limited to a single
    first line, and neither hook lookups nor spool replay scan workspace files.
    """

    def __init__(self, home):
        self.root = (home / "sessions").resolve()
        self.paths = {}
        self.cache = {}
        self.next_scan = 0

    def remember(self, path, session_id):
        if isinstance(session_id, str) and session_id:
            if session_id not in self.paths and len(self.paths) >= MAX_SOURCE_INDEX_FILES:
                del self.paths[next(iter(self.paths))]
            self.paths[session_id] = path

    def scan(self):
        if time.monotonic() < self.next_scan:
            return
        self.next_scan = time.monotonic() + 10
        deadline = time.monotonic() + 0.5
        count = 0
        for directory, directories, filenames in os.walk(str(self.root)):
            if time.monotonic() > deadline:
                return
            directories.sort(reverse=True)
            for filename in filenames:
                count += 1
                if count > MAX_SOURCE_INDEX_FILES or time.monotonic() > deadline:
                    return
                if not filename.endswith(".jsonl"):
                    continue
                match = re.search(r"([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})\.jsonl$", filename)
                key = match.group(1) if match else Path(filename).stem
                if key not in self.paths:
                    self.remember(Path(directory) / filename, key)

    def resolve(self, payload):
        session_id = payload.get("session_id", payload.get("thread_id"))
        if not isinstance(session_id, str) or not session_id or len(session_id) > 128:
            return None
        transcript = payload.get("transcript_path")
        if transcript is not None:
            if not isinstance(transcript, str) or not transcript:
                return None
            path = Path(transcript)
            if not path.is_absolute():
                return None
        else:
            if session_id not in self.paths:
                self.scan()
            path = self.paths.get(session_id)
            if path is None:
                return None
        try:
            path = path.resolve()
            path.relative_to(self.root)
            info = path.stat()
            if not stat.S_ISREG(info.st_mode):
                return None
            signature = (*identity(info), info.st_size, info.st_mtime_ns)
            cached = self.cache.get(path)
            if cached is None or cached[0] != signature:
                cached = (signature, session_metadata(path))
                if len(self.cache) >= MAX_SOURCE_INDEX_FILES:
                    self.cache.clear()
                self.cache[path] = cached
            metadata = cached[1]
            if metadata is None or metadata["session_id"] != session_id:
                return None
            self.remember(path, session_id)
            return metadata
        except (OSError, ValueError):
            self.paths.pop(session_id, None)
            return None

    def allows(self, event_type, payload):
        if event_type in ("test", "heartbeat"):
            return True
        metadata = self.resolve(payload)
        return vscode_source(metadata) and not (event_type == "done" and metadata["subagent"])


class SourceCheckedSpool:
    """Hold unresolved records briefly while new rollout metadata is discovered."""

    def __init__(self, sources, receiver):
        self.sources = sources
        self.receiver = receiver
        self.pending = {}

    def emit_verified(self, record):
        # valid_line has removed any originator claimed by the spool itself.
        # This marker is added only after fresh session metadata verification.
        if record["type"] not in ("test", "heartbeat"):
            record["originator"] = "codex_vscode"
        self.receiver(record)

    def accept(self, line, cutoff=None):
        record = valid_line(line, cutoff)
        if record is None:
            return
        if self.sources.allows(record["type"], record):
            self.pending.pop(record["id"], None)
            self.emit_verified(record)
        elif self.sources.resolve(record) is None:
            self.pending[record["id"]] = (record, time.monotonic() + 15)
            while len(self.pending) > 500:
                del self.pending[next(iter(self.pending))]

    def retry(self):
        for key, (record, deadline) in list(self.pending.items()):
            if self.sources.allows(record["type"], record):
                self.emit_verified(record)
                del self.pending[key]
            elif time.monotonic() >= deadline or self.sources.resolve(record) is not None:
                del self.pending[key]


def input_tool_name(value):
    if not isinstance(value, str):
        return ""
    name = value[len("functions."):] if value.startswith("functions.") else value
    return name if name in ("request_user_input", "request_user_input_async") else ""


def question_acknowledged(payload):
    output = payload.get("output")
    try:
        output = json.loads(output) if isinstance(output, str) else output
    except (ValueError, TypeError):
        return False
    return isinstance(output, dict) and output.get("accepted") is True and "answers" not in output


def question_items(payload):
    try:
        arguments = payload.get("arguments")
        arguments = json.loads(arguments) if isinstance(arguments, str) else arguments
        questions = arguments.get("questions") if isinstance(arguments, dict) else None
        return set(range(len(questions))) if isinstance(questions, list) and 0 < len(questions) <= 128 else None
    except (ValueError, TypeError):
        return None


def question_replies(payload):
    # Match only application-generated user replies, never assistant prose or
    # tool results. Keep call IDs and item indexes; discard questions/answers.
    if payload.get("type") != "message" or payload.get("role") != "user":
        return []
    content = payload.get("content")
    if not isinstance(content, list):
        return []
    text = "".join(item.get("text", "") for item in content
                   if isinstance(item, dict) and item.get("type") == "input_text" and isinstance(item.get("text"), str))
    match = re.fullmatch(r"\s*<send_user_message_question_reply>\s*(.*?)\s*</send_user_message_question_reply>\s*", text, re.DOTALL)
    if not match:
        return []
    try:
        replies = json.loads(match.group(1))
        if not isinstance(replies, list) or len(replies) > 128:
            return []
        result = []
        for reply in replies:
            if not isinstance(reply, dict) or "answer" not in reply:
                continue
            item = reply.get("questionItemId")
            item = json.loads(item) if isinstance(item, str) else item
            if (isinstance(item, list) and len(item) == 3 and input_tool_name(item[0]) == "request_user_input_async"
                    and isinstance(item[1], str) and 0 < len(item[1]) <= 128
                    and isinstance(item[2], int) and not isinstance(item[2], bool) and 0 <= item[2] < 128):
                result.append((item[1], item[2]))
        return result
    except (ValueError, TypeError):
        return []


class RolloutObserver:
    """Read recent active rollout files without scanning the historical corpus.

    This is a version-sensitive adapter for observed Codex 0.153.0 log records,
    not a public API. Unknown schemas are ignored and no conversational text
    is forwarded to the receiver.
    """

    def __init__(self, home, replay_seconds, sources=None, retention=DEFAULT_RETENTION_DAYS):
        self.home = home
        self.replay_seconds = replay_seconds
        self.states = {}
        self.next_scan = 0
        self.next_poll = 0
        self.sources = sources
        self.retention = retention_days(retention)

    def discover(self):
        now = time.time()
        candidates = []
        # Resuming an old task appends to its ORIGINAL date directory. Inspect
        # metadata across sessions, but never read historical file bodies here.
        for directory, unused_directories, filenames in os.walk(str(self.home / "sessions")):
            for filename in filenames:
                if not filename.endswith(".jsonl"):
                    continue
                path = Path(directory) / filename
                try:
                    info = path.stat()
                    if stat.S_ISREG(info.st_mode) and info.st_mtime >= now - 36 * 3600:
                        candidates.append((info.st_mtime, path))
                except OSError:
                    continue
        candidates.sort(key=lambda item: item[0], reverse=True)
        retained = {path for unused, path in candidates[:MAX_ROLLOUT_FILES]}
        for path in list(self.states):
            if path not in retained:
                del self.states[path]
        for path in retained:
            self.states.setdefault(path, {"offset": None, "identity": None,
                                         "session_id": "", "cwd": "", "discard": False,
                                         "subagent": False, "originator": None})

    def metadata(self, path, state):
        # Filename identity alone never establishes an allowed originator.
        match = re.search(r"([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})\.jsonl$", path.name)
        state["session_id"] = match.group(1) if match else path.stem[-128:]
        state["subagent"] = False
        state["originator"] = None
        state["cwd"] = ""
        for key in ("task", "turn_id", "model", "tier", "previous_usage", "waiting_calls", "question_items"):
            state.pop(key, None)
        state["source_filter_version"] = SOURCE_FILTER_VERSION
        metadata = session_metadata(path)
        if metadata is not None:
            state.update(metadata)
            if self.sources is not None:
                self.sources.remember(path, metadata["session_id"])

    def update_task(self, outer, payload, state):
        """Keep only state and validated counters. Never retain text/tool args."""
        if state.get("subagent"):
            return False
        kind, subtype = outer.get("type"), payload.get("type")
        changed = False
        if kind == "turn_context":
            state["model"] = clean_text(payload.get("model", ""), 128)
            state["tier"] = clean_text(payload.get("service_tier") or "standard", 128)
            turn = clean_text(payload.get("turn_id", ""), 128)
            if turn and not state.get("turn_id"):
                state["turn_id"] = turn
                state["task"] = {"state": "unknown", "sequence": 0, "model": state["model"],
                                 "usage": {"complete": False, "segments": []}}
            if state.get("task"):
                state["task"]["model"] = state["model"]
                changed = True
        if kind == "event_msg" and subtype == "task_started":
            turn = clean_text(payload.get("turn_id", ""), 128)
            if not turn:
                return False
            state["turn_id"] = turn
            state["waiting_calls"] = {}
            state["question_items"] = {}
            state["task"] = {"state": "running", "sequence": 0, "model": state.get("model", ""),
                             "usage": {"complete": state.get("previous_usage") is not None or state.get("history_complete", False), "segments": []}}
            changed = True
        if kind == "event_msg" and subtype == "token_count":
            info = payload.get("info")
            if not isinstance(info, dict):
                return False
            total = token_usage(info.get("total_token_usage"))
            if total is None:
                return False
            previous = state.get("previous_usage")
            state["previous_usage"] = total
            if not state.get("task") or not state.get("turn_id"):
                return False  # Establish the baseline without guessing a task.
            usage = state["task"]["usage"]
            if previous is not None:
                delta = {key: total[key] - previous[key] for key in TOKEN_FIELDS}
                if any(count < 0 for count in delta.values()):
                    delta = token_usage(info.get("last_token_usage"))
                    usage["complete"] = False
            elif usage["complete"]:
                delta = total
            else:
                delta = token_usage(info.get("last_token_usage"))
            if delta is None or not any(delta.values()):
                return False
            if delta["cachedInput"] + delta["cacheWrite"] > delta["input"] or delta["reasoningOutput"] > delta["output"]:
                usage["complete"] = False
                return False
            model, tier = state.get("model", ""), state.get("tier", "standard")
            segment = next((item for item in usage["segments"] if item["model"] == model and item["tier"] == tier), None)
            if segment is None:
                if len(usage["segments"]) >= 16:
                    usage["complete"] = False
                    return True
                segment = {"model": model, "tier": tier, **{key: 0 for key in TOKEN_FIELDS}}
                usage["segments"].append(segment)
            if any(segment[key] + delta[key] > 10 ** 12 for key in TOKEN_FIELDS):
                usage["complete"] = False
                return True
            for key in TOKEN_FIELDS:
                segment[key] += delta[key]
            if state["task"]["state"] == "unknown":
                state["task"]["state"] = "running"
            changed = True
        if kind == "event_msg" and subtype in ("task_complete", "turn_aborted", "task_failed"):
            turn = clean_text(payload.get("turn_id", state.get("turn_id", "")), 128)
            if turn:
                if turn != state.get("turn_id") or not state.get("task"):
                    state["turn_id"] = turn
                    state["task"] = {"state": "unknown", "sequence": 0, "model": state.get("model", ""),
                                     "usage": {"complete": False, "segments": []}}
                state["task"]["state"] = {"task_complete": "completed", "turn_aborted": "cancelled", "task_failed": "failed"}[subtype]
                state["waiting_calls"] = {}
                state["question_items"] = {}
                changed = True
        if state.get("task") and kind == "response_item":
            if subtype == "function_call" and input_tool_name(payload.get("name")):
                # A question logged after completion still belongs to that turn.
                call = clean_text(payload.get("call_id", ""), 128)
                if len(state.setdefault("waiting_calls", {})) < 128:
                    state["waiting_calls"][call] = input_tool_name(payload["name"]) == "request_user_input_async"
                    state.setdefault("question_items", {})[call] = question_items(payload)
                state["task"]["state"] = "waiting_async" if all(state["waiting_calls"].values()) else "waiting_input"
                changed = True
            elif subtype == "function_call_output" and payload.get("call_id") in state.get("waiting_calls", set()):
                if state["waiting_calls"][payload["call_id"]] and question_acknowledged(payload):
                    return False  # Request accepted is not a user's answer.
                state["waiting_calls"].pop(payload["call_id"], None)
                state.get("question_items", {}).pop(payload["call_id"], None)
                state["task"]["state"] = ("waiting_async" if all(state["waiting_calls"].values()) else "waiting_input") if state["waiting_calls"] else "running"
                changed = True
            elif subtype == "message":
                for call, index in question_replies(payload):
                    if not state.get("waiting_calls", {}).get(call):
                        continue
                    remaining = state.get("question_items", {}).get(call)
                    if remaining is not None:
                        if index not in remaining:
                            continue
                        remaining.remove(index)
                        if remaining:
                            continue
                    state["waiting_calls"].pop(call, None)
                    state.get("question_items", {}).pop(call, None)
                    changed = True
                if changed:
                    state["task"]["state"] = ("waiting_async" if all(state["waiting_calls"].values()) else "waiting_input") if state["waiting_calls"] else "running"
        if changed and state.get("task"):
            state["task"]["sequence"] = state.get("line_position", 0)
        return changed and bool(state.get("task"))

    def convert(self, line, state, cutoff):
        if len(line) > ROLLOUT_TAIL_BYTES or not vscode_source(state):
            return None
        try:
            outer = json.loads(line)
            if not isinstance(outer, dict):
                return None
            payload = outer.get("payload")
            if not isinstance(payload, dict):
                return None
            if outer.get("type") == "session_meta":
                # Provenance belongs to the first line. A later metadata record
                # cannot reclassify a Desktop/CLI-created session as VS Code.
                return None
            timestamp = rollout_timestamp(outer.get("timestamp"))
            if timestamp is None:
                return None
            changed = self.update_task(outer, payload, state)
            if timestamp < cutoff:
                return None
            event_type = None
            stable_part = None
            if outer.get("type") == "event_msg" and payload.get("type") == "task_complete":
                if state.get("subagent"):
                    return None
                event_type = "done"
                stable_part = clean_text(payload.get("turn_id", outer.get("timestamp")), 128)
            elif (outer.get("type") == "response_item" and payload.get("type") == "function_call"
                  and input_tool_name(payload.get("name"))):
                event_type = "question"
                stable_part = clean_text(payload.get("call_id", outer.get("timestamp")), 128)
            if event_type is None:
                if not changed or not state.get("turn_id"):
                    return None
                event_type = "task"
                stable_part = state["turn_id"]
            record = event_record(self.home, event_type, {"cwd": state["cwd"],
                                  "session_id": state["session_id"],
                                  "turn_id": payload.get("turn_id", state.get("turn_id", ""))},
                                  verified_originator=state["originator"])[0]
            record["timestamp"] = timestamp
            record["id"] = uuid.uuid5(uuid.NAMESPACE_URL,
                "codex-beacon:{}:{}:{}".format(event_type, state["session_id"], stable_part)).hex
            if state.get("task"):
                # Deep copy counters: later updates must not rewrite earlier events.
                record["task"] = json.loads(json.dumps(state["task"]))
            return record
        except (ValueError, UnicodeDecodeError, TypeError):
            return None

    def poll(self, force=False):
        control = privacy_state(self.home)
        if control["paused"]:
            self.states.clear()
            return []
        monotonic = time.monotonic()
        if not force and monotonic < self.next_poll:
            return []
        self.next_poll = monotonic + 2
        if force or monotonic >= self.next_scan:
            self.discover()
            self.next_scan = monotonic + 10
        output = []
        cutoff = max(time.time() - min(self.replay_seconds, self.retention * 86400), control["cutoff"])
        for path, state in list(self.states.items()):
            try:
                info = path.stat()
                current_identity = identity(info)
                initial = (state["offset"] is None or state["identity"] != current_identity
                           or info.st_size < state["offset"])
                if (initial or state.get("source_filter_version") != SOURCE_FILTER_VERSION
                        or state.get("originator") is None and state.get("metadata_size") != info.st_size):
                    self.metadata(path, state)
                    state["metadata_size"] = info.st_size
                if initial:
                    state["offset"] = max(0, info.st_size - ROLLOUT_TAIL_BYTES)
                    state["identity"] = current_identity
                    state["discard"] = state["offset"] > 0
                    state["history_complete"] = state["offset"] == 0
                if not vscode_source(state):
                    state["offset"] = info.st_size
                    state["discard"] = False
                    continue
                if info.st_size <= state["offset"]:
                    continue
                with path.open("rb") as stream:
                    stream.seek(state["offset"])
                    chunk = stream.read(ROLLOUT_TAIL_BYTES)
                end = chunk.rfind(b"\n")
                if end < 0:
                    if len(chunk) == ROLLOUT_TAIL_BYTES:
                        state["offset"] += len(chunk)
                        state["discard"] = True
                    continue
                line_position = state["offset"]
                state["offset"] += end + 1
                lines = chunk[:end + 1].splitlines()
                if state["discard"]:
                    line_position += len(lines[0]) + 1
                    lines = lines[1:]
                    state["discard"] = False
                for line in lines:
                    line_position += len(line) + 1
                    state["line_position"] = line_position
                    record = self.convert(line, state, cutoff)
                    if record is not None:
                        output.append(record)
            except OSError:
                continue
        return output


def follow(args):
    home = safe_home(args.codex_home or codex_home())
    next_paused_heartbeat = 0
    while privacy_state(home)["paused"]:
        if time.monotonic() >= next_paused_heartbeat:
            emit_live(home, event_record(home, "heartbeat")[0])
            next_paused_heartbeat = time.monotonic() + 15
        if args.once:
            return
        time.sleep(0.5)
    directory = home / DIRECTORY_NAME
    make_directory(directory)
    store_retention_policy(home, args.retention_days)
    prune_notification_cache(home, args.retention_days)
    path = directory / "events.jsonl"
    old_identity = None
    offset = 0
    replay = b""
    with spool_lock(home) as active:
        if active and path.exists():
            info = path.stat()
            old_identity = identity(info)
            start = max(0, info.st_size - REPLAY_BYTES)
            with path.open("rb") as stream:
                stream.seek(start)
                replay = stream.read(REPLAY_BYTES)
            if start:
                replay = replay.partition(b"\n")[2]
            offset = info.st_size
    sources = SessionSources(home)
    spool = SourceCheckedSpool(sources, lambda record: emit_live(home, record))
    rollouts = RolloutObserver(home, args.replay_seconds, sources, args.retention_days) if not args.no_rollouts else None
    initial_rollouts = rollouts.poll(force=True) if rollouts is not None else []
    emit_live(home, event_record(home, "heartbeat")[0])
    cutoff = max(time.time() - min(args.replay_seconds, args.retention_days * 86400), privacy_state(home)["cutoff"])
    for line in replay.splitlines()[-500:]:
        spool.accept(line, cutoff)
    for record in initial_rollouts:
        emit_live(home, record)
    if args.once:
        return
    next_heartbeat = time.monotonic() + 15
    next_prune = time.monotonic() + 60
    while True:
        if privacy_state(home)["paused"]:
            spool.pending.clear()
            if rollouts is not None:
                rollouts.states.clear()
            if time.monotonic() >= next_heartbeat:
                emit_live(home, event_record(home, "heartbeat")[0])
                next_heartbeat = time.monotonic() + 15
            time.sleep(0.5)
            continue
        if time.monotonic() >= next_prune:
            prune_notification_cache(home, args.retention_days)
            next_prune = time.monotonic() + 60
        chunks = []
        with spool_lock(home) as active:
            if active and path.exists():
                info = path.stat()
                new_identity = identity(info)
                if old_identity is not None and new_identity != old_identity:
                    rotated = directory / "events.jsonl.1"
                    if rotated.exists() and identity(rotated.stat()) == old_identity:
                        tail, unused_offset = read_chunk(rotated, offset, MAX_BATCH_BYTES)
                        chunks.append(tail)
                    offset = 0
                elif info.st_size < offset:
                    offset = 0
                old_identity = new_identity
                data, offset = read_chunk(path, offset, MAX_BATCH_BYTES)
                chunks.append(data)
        for chunk in chunks:
            for line in chunk.splitlines():
                spool.accept(line, max(time.time() - args.retention_days * 86400, privacy_state(home)["cutoff"]))
        if rollouts is not None:
            for record in rollouts.poll():
                emit_live(home, record)
        spool.retry()
        if time.monotonic() >= next_heartbeat:
            emit_live(home, event_record(home, "heartbeat")[0])
            next_heartbeat = time.monotonic() + 15
        time.sleep(0.5)


def read_session_titles(home, session_ids):
    """Read only display names for requested IDs; never read message columns."""
    if privacy_state(home)["paused"]:
        return []
    ids = list(dict.fromkeys(session_ids))
    if len(ids) > 200 or any(not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", value) for value in ids):
        raise ValueError("invalid session title request")
    if not ids:
        return []
    requested, titles = set(ids), {}
    try:
        index = safe_path(home, "session_index.jsonl")
        if not stat.S_ISREG(index.stat().st_mode):
            raise ValueError("session title index must be a regular file")
        with index.open("rb") as stream:
            size = index.stat().st_size
            stream.seek(max(0, size - MAX_TITLE_INDEX_BYTES))
            chunk = stream.read(MAX_TITLE_INDEX_BYTES)
        if size > MAX_TITLE_INDEX_BYTES:
            chunk = chunk.partition(b"\n")[2]
        for line in chunk.splitlines()[-MAX_SOURCE_INDEX_FILES:]:
            if len(line) > MAX_METADATA_BYTES:
                continue
            try:
                row = json.loads(line)
                if isinstance(row, dict) and isinstance(row.get("id"), str) and row["id"] in requested and isinstance(row.get("thread_name"), str):
                    title = clean_text(row["thread_name"], 160).strip()
                    if title:
                        titles[row["id"]] = title
            except (ValueError, UnicodeDecodeError):
                continue
    except (OSError, ValueError):
        pass
    # Versioned SQLite state is optional. Read the current WAL through a read-only
    # connection; immutable mode would miss recent edits. Never create a database.
    databases = sorted((path for path in home.glob("state_*.sqlite") if re.fullmatch(r"state_\d+\.sqlite", path.name)),
                       key=lambda path: int(path.stem.split("_")[1]), reverse=True)
    for database in databases[:3]:
        try:
            database = safe_path(home, database.name)
            with contextlib.closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=0.1)) as connection:
                connection.execute("PRAGMA query_only=ON")
                columns = {row[1] for row in connection.execute("PRAGMA table_info(threads)")}
                if not {"id", "title"}.issubset(columns):
                    continue
                name = "name" if "name" in columns else "NULL"
                placeholders = ",".join("?" for unused in ids)
                for session_id, custom, default in connection.execute(
                        "SELECT id, " + name + ", title FROM threads WHERE id IN (" + placeholders + ")", ids):
                    title = clean_text(custom or default, 160).strip() if isinstance(custom or default, str) else ""
                    if title:
                        titles[session_id] = title
                break
        except (OSError, ValueError, sqlite3.Error):
            continue
    return [{"session_id": session_id, "title": titles[session_id]} for session_id in ids if session_id in titles]


def session_titles(args):
    home = safe_home(args.codex_home or codex_home())
    print(json.dumps({"titles": read_session_titles(home, args.session_id)}, ensure_ascii=False))


def main(argv=None):
    # SSH stdout is an explicitly UTF-8 JSONL protocol, independent of locale.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("install", "uninstall", "test", "follow", "hook", "privacy-status", "preview-privacy-cleanup", "clear-private-data", "resume-private-data", "session-titles"):
        subparser = commands.add_parser(name)
        subparser.add_argument("--codex-home", help="Codex config directory (default: CODEX_HOME or ~/.codex)")
        subparser.add_argument("--retention-days", type=retention_days, default=DEFAULT_RETENTION_DAYS)
        if name == "install":
            subparser.add_argument("--label", help="Server/container label displayed in Windows")
            subparser.add_argument("--if-missing", action="store_true", help="Preserve an existing Beacon definition; respect privacy pause")
        elif name == "follow":
            subparser.add_argument("--once", action="store_true", help="Replay recent records and exit")
            subparser.add_argument("--replay-seconds", type=float, default=300)
            subparser.add_argument("--no-rollouts", action="store_true",
                                   help="Disable version-sensitive rollout observations")
        elif name == "hook":
            subparser.add_argument("--event", required=True, choices=("done", "approval", "question"))
            subparser.add_argument("--owner", default=OWNER, choices=(OWNER,))
        elif name == "clear-private-data":
            subparser.add_argument("--preview-token", required=True)
        elif name == "session-titles":
            subparser.add_argument("--session-id", action="append", default=[])
    args = parser.parse_args(argv)
    try:
        if args.command == "test":
            record = append_event(codex_home(args.codex_home), "test", {"cwd": os.getcwd()}, retention=args.retention_days)
            print(json.dumps({"queued": record is not None, "id": record["id"] if record else None, "paused": record is None}))
        else:
            globals()[args.command.replace("-", "_")](args)
        return 0
    except (KeyboardInterrupt, BrokenPipeError):
        return 0
    except Exception as error:
        print("codex-beacon: {}".format(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
