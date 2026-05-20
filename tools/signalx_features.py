#!/usr/bin/env python3
"""
signalx_features.py

This script manages feature flags for SignalX. It allows you to list available features
and toggle them on or off. Feature state is persisted to a JSON file either in the
repository at `.signalx/features.json` or in the user's application data directory
(`~/Library/Application Support/com.signalx.desktop/features.json`).

Usage:

  python3 tools/signalx_features.py list [--repo-local]
      List all available features and whether they are enabled.

  python3 tools/signalx_features.py on <feature> [<feature> ...] [--repo-local]
      Enable one or more features.

  python3 tools/signalx_features.py off <feature> [<feature> ...] [--repo-local]
      Disable one or more features.

  python3 tools/signalx_features.py toggle <feature> [<feature> ...] [--repo-local]
      Toggle one or more features between enabled and disabled.

  python3 tools/signalx_features.py preset <name> [--repo-local]
      Apply a preset (minimal, ops, full) to all features.

  python3 tools/signalx_features.py reset [--repo-local]
      Reset to default (minimal) preset.

The `--repo-local` flag causes the script to read/write `.signalx/features.json`
in the repository root. Without it the script writes to the system application
data directory on macOS (`~/Library/Application Support/com.signalx.desktop`).
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Define all available features and their default enabled state.
AVAILABLE_FEATURES = {
    "ui.panel.tools": False,
    "ui.panel.contacts": False,
    "ui.panel.device": False,
    "ui.panel.ai": True,
    "ui.modal.settings": False,
    "ui.modal.diagnostics": True,
    "ai.drafting": True,
    "ai.send_auto": False,
}

# Preset definitions. "minimal" enables only the features that are True by default.
# "full" enables everything. "ops" is an operational preset with sensible defaults
# for daily use (disables device and contacts panels).
PRESETS = {
    "minimal": {key: value for key, value in AVAILABLE_FEATURES.items() if value},
    "full": {key: True for key in AVAILABLE_FEATURES},
    "ops": {
        **{key: True for key in AVAILABLE_FEATURES},
        "ui.panel.device": False,
        "ui.panel.contacts": False,
    },
}


def get_repo_root() -> Path:
    """Return the repository root (directory containing this script)."""
    return Path(__file__).resolve().parents[2]


def get_features_path(repo_local: bool) -> Path:
    """Determine the path to the features JSON file."""
    if repo_local:
        repo_root = get_repo_root()
        path = repo_root / ".signalx" / "features.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    else:
        # default to macOS application support directory
        home = Path(os.path.expanduser("~"))
        path = home / "Library" / "Application Support" / "com.signalx.desktop" / "features.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path


def load_features(path: Path) -> dict:
    """Load existing feature flags from a file or return defaults."""
    if path.is_file():
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
                # ensure all keys exist; fill missing values with defaults
                out = {**AVAILABLE_FEATURES}
                for k, v in data.items():
                    if k in AVAILABLE_FEATURES and isinstance(v, bool):
                        out[k] = v
                return out
        except Exception:
            pass
    # return defaults (minimal preset)
    return {key: value for key, value in PRESETS["minimal"].items()}


def save_features(path: Path, data: dict) -> None:
    """Persist feature flags to JSON file."""
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def cmd_list(args: argparse.Namespace) -> None:
    features_path = get_features_path(args.repo_local)
    data = load_features(features_path)
    print("Feature flags ({}):".format(features_path))
    for key in sorted(AVAILABLE_FEATURES.keys()):
        print(f"  {key}: {'ON' if data.get(key, False) else 'OFF'}")


def apply_changes(features: dict, keys: list[str], state_func) -> dict:
    """Apply a state function to given keys and return updated features."""
    updated = features.copy()
    for key in keys:
        if key not in AVAILABLE_FEATURES:
            print(f"Warning: unknown feature '{key}'", file=sys.stderr)
            continue
        updated[key] = state_func(features.get(key, False))
    return updated


def cmd_on(args: argparse.Namespace) -> None:
    features_path = get_features_path(args.repo_local)
    features = load_features(features_path)
    updated = apply_changes(features, args.features, lambda _: True)
    save_features(features_path, updated)
    cmd_list(args)


def cmd_off(args: argparse.Namespace) -> None:
    features_path = get_features_path(args.repo_local)
    features = load_features(features_path)
    updated = apply_changes(features, args.features, lambda _: False)
    save_features(features_path, updated)
    cmd_list(args)


def cmd_toggle(args: argparse.Namespace) -> None:
    features_path = get_features_path(args.repo_local)
    features = load_features(features_path)
    updated = apply_changes(features, args.features, lambda v: not v)
    save_features(features_path, updated)
    cmd_list(args)


def cmd_preset(args: argparse.Namespace) -> None:
    name = args.preset_name
    if name not in PRESETS:
        print(f"Unknown preset: {name}\nAvailable: {', '.join(PRESETS.keys())}", file=sys.stderr)
        sys.exit(1)
    features_path = get_features_path(args.repo_local)
    preset = PRESETS[name]
    # start with all defaults, then override with preset values
    base = {**AVAILABLE_FEATURES}
    for k, v in preset.items():
        base[k] = v
    save_features(features_path, base)
    cmd_list(args)


def cmd_reset(args: argparse.Namespace) -> None:
    # reset to minimal preset
    args.preset_name = "minimal"
    cmd_preset(args)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage SignalX feature flags")
    parser.add_argument("--repo-local", action="store_true", help="Use repository-local features.json")
    subparsers = parser.add_subparsers(dest="cmd", required=True)

    sp_list = subparsers.add_parser("list", help="List all features")

    sp_on = subparsers.add_parser("on", help="Enable features")
    sp_on.add_argument("features", nargs="+", help="Feature names to enable")

    sp_off = subparsers.add_parser("off", help="Disable features")
    sp_off.add_argument("features", nargs="+", help="Feature names to disable")

    sp_toggle = subparsers.add_parser("toggle", help="Toggle features")
    sp_toggle.add_argument("features", nargs="+", help="Feature names to toggle")

    sp_preset = subparsers.add_parser("preset", help="Apply a preset")
    sp_preset.add_argument("preset_name", choices=list(PRESETS.keys()), help="Preset name")

    sp_reset = subparsers.add_parser("reset", help="Reset to default preset (minimal)")

    return parser.parse_args(argv)


def main(argv: list[str]) -> None:
    args = parse_args(argv)
    if args.cmd == "list":
        cmd_list(args)
    elif args.cmd == "on":
        cmd_on(args)
    elif args.cmd == "off":
        cmd_off(args)
    elif args.cmd == "toggle":
        cmd_toggle(args)
    elif args.cmd == "preset":
        cmd_preset(args)
    elif args.cmd == "reset":
        cmd_reset(args)
    else:
        raise SystemExit(f"Unknown command: {args.cmd}")


if __name__ == "__main__":
    main(sys.argv[1:])
