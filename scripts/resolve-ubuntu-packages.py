#!/usr/bin/env python3
"""
Downloads the .deb files ServerLab needs for an offline install on one Ubuntu release, with every
dependency, and writes a Packages index so the folder works as a local apt repository.

Usage: resolve-ubuntu-packages.py OUTPUT_DIRECTORY [--release noble] [--architecture amd64]

Packages marked Essential or Priority "required" are left out: every Ubuntu install has them.
Everything else in the dependency closure is included, so apt can install the packages offline
whatever the server already has (apt skips what is installed and up to date).
Needs python3-apt (for Debian version comparison) and network access.
"""

import argparse
import gzip
import hashlib
import lzma
import os
import re
import sys
import urllib.request

import apt_pkg

ROOT_PACKAGES = [
    "ca-certificates", "curl", "gzip", "openssl", "rsync", "sqlite3", "python3", "dmidecode",
    "xz-utils", "nginx", "polkitd", "tailscale", "pciutils", "util-linux",
]
UBUNTU_MIRROR = "http://archive.ubuntu.com/ubuntu"
TAILSCALE_REPOSITORY = "https://pkgs.tailscale.com/stable/ubuntu"


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "serverlab-offline-builder"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def parse_packages_index(text: str, base_url: str) -> list[dict]:
    """Splits a Debian Packages index into stanzas (multi-line fields joined)."""
    stanzas = []
    for block in text.split("\n\n"):
        fields: dict[str, str] = {}
        last_key = None
        for line in block.splitlines():
            if line.startswith((" ", "\t")) and last_key:
                fields[last_key] += "\n" + line
            elif ":" in line:
                key, value = line.split(":", 1)
                fields[key] = value.strip()
                last_key = key
        if "Package" in fields and "Filename" in fields:
            fields["_base_url"] = base_url
            stanzas.append(fields)
    return stanzas


def load_indexes(release: str, architecture: str) -> list[dict]:
    stanzas: list[dict] = []
    for suite in (release, f"{release}-updates", f"{release}-security"):
        for component in ("main", "universe"):
            url = f"{UBUNTU_MIRROR}/dists/{suite}/{component}/binary-{architecture}/Packages.xz"
            print(f"  index {suite}/{component}", file=sys.stderr)
            stanzas += parse_packages_index(lzma.decompress(fetch(url)).decode("utf-8", "replace"), UBUNTU_MIRROR)
    url = f"{TAILSCALE_REPOSITORY}/dists/{release}/main/binary-{architecture}/Packages.gz"
    print("  index tailscale", file=sys.stderr)
    stanzas += parse_packages_index(gzip.decompress(fetch(url)).decode("utf-8", "replace"), TAILSCALE_REPOSITORY)
    return stanzas


def newest_by_name(stanzas: list[dict]) -> tuple[dict[str, dict], dict[str, list[str]]]:
    """The newest version of every package, and which packages provide each virtual name."""
    newest: dict[str, dict] = {}
    for stanza in stanzas:
        current = newest.get(stanza["Package"])
        if current is None or apt_pkg.version_compare(stanza["Version"], current["Version"]) > 0:
            newest[stanza["Package"]] = stanza
    providers: dict[str, list[str]] = {}
    for name, stanza in newest.items():
        for provided in stanza.get("Provides", "").split(","):
            provided_name = re.sub(r"\s*\(.*\)", "", provided).strip().split(":")[0]
            if provided_name:
                providers.setdefault(provided_name, []).append(name)
    return newest, providers


def dependency_alternatives(stanza: dict) -> list[list[str]]:
    """Depends and Pre-Depends as a list of alternative groups, names only."""
    groups = []
    for field in ("Pre-Depends", "Depends"):
        for group in stanza.get(field, "").split(","):
            names = [re.sub(r"\s*\(.*\)|\s*\[.*\]", "", alternative).strip().split(":")[0] for alternative in group.split("|")]
            names = [name for name in names if name]
            if names:
                groups.append(names)
    return groups


def is_base_system(stanza: dict) -> bool:
    return stanza.get("Essential") == "yes" or stanza.get("Priority") == "required"


def resolve(newest: dict[str, dict], providers: dict[str, list[str]]) -> list[dict]:
    chosen: dict[str, dict] = {}
    pending = list(ROOT_PACKAGES)
    while pending:
        name = pending.pop()
        if name in chosen:
            continue
        stanza = newest.get(name)
        if stanza is None:
            candidates = providers.get(name, [])
            if not candidates:
                raise SystemExit(f"error: no package or provider for '{name}'")
            stanza = newest[sorted(candidates)[0]]
            if stanza["Package"] in chosen:
                continue
        if is_base_system(stanza) and stanza["Package"] not in ROOT_PACKAGES:
            continue
        chosen[stanza["Package"]] = stanza
        for alternatives in dependency_alternatives(stanza):
            if any(alternative in chosen for alternative in alternatives):
                continue
            available = [alternative for alternative in alternatives if alternative in newest or alternative in providers]
            if not available:
                raise SystemExit(f"error: {stanza['Package']} needs one of {alternatives}, none available")
            pending.append(available[0])
    return sorted(chosen.values(), key=lambda stanza: stanza["Package"])


def download(stanzas: list[dict], output_directory: str) -> None:
    os.makedirs(output_directory, exist_ok=True)
    index_lines = []
    for stanza in stanzas:
        file_name = os.path.basename(stanza["Filename"])
        path = os.path.join(output_directory, file_name)
        expected = stanza.get("SHA256", "")
        if not (os.path.exists(path) and hashlib.sha256(open(path, "rb").read()).hexdigest() == expected):
            print(f"  download {file_name}", file=sys.stderr)
            data = fetch(f"{stanza['_base_url']}/{stanza['Filename']}")
            if expected and hashlib.sha256(data).hexdigest() != expected:
                raise SystemExit(f"error: checksum mismatch for {file_name}")
            with open(path, "wb") as handle:
                handle.write(data)
        fields = {key: value for key, value in stanza.items() if not key.startswith("_")}
        fields["Filename"] = f"./{file_name}"
        index_lines.append("\n".join(f"{key}: {value}" for key, value in fields.items()))
    with open(os.path.join(output_directory, "Packages"), "w", encoding="utf-8") as handle:
        handle.write("\n\n".join(index_lines) + "\n")
    wanted = {os.path.basename(stanza["Filename"]) for stanza in stanzas} | {"Packages"}
    for stale in set(os.listdir(output_directory)) - wanted:
        os.remove(os.path.join(output_directory, stale))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_directory")
    parser.add_argument("--release", default="noble")
    parser.add_argument("--architecture", default="amd64")
    arguments = parser.parse_args()
    apt_pkg.init()
    print(f"resolving packages for Ubuntu {arguments.release} {arguments.architecture}", file=sys.stderr)
    newest, providers = newest_by_name(load_indexes(arguments.release, arguments.architecture))
    stanzas = resolve(newest, providers)
    print(f"  {len(stanzas)} packages", file=sys.stderr)
    download(stanzas, arguments.output_directory)
    total = sum(os.path.getsize(os.path.join(arguments.output_directory, name)) for name in os.listdir(arguments.output_directory))
    print(f"  {total / 1024 / 1024:.0f} MB in {arguments.output_directory}", file=sys.stderr)


if __name__ == "__main__":
    main()
