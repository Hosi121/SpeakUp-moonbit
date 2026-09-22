#!/usr/bin/env bash
set -euo pipefail
# Optional Ubuntu 24.04 x86_64 setup without sudo. Normal system installations
# may use: sudo apt-get install build-essential libmariadb-dev libssl-dev
cd "$(dirname "$0")/.."
if [[ "$(uname -m)" != x86_64 ]] || ! command -v apt-get >/dev/null; then
  echo 'Install a C compiler, MariaDB Connector/C development files, and OpenSSL development files using your system package manager.' >&2
  exit 1
fi
mkdir -p .tools/native/debs
native_download_dir=$(mktemp -d .tools/native/debs/session.XXXXXX)
cd "$native_download_dir"
apt-get download libmariadb-dev libmariadb3 libssl-dev libssl3t64
for package in *.deb; do dpkg-deb -x "$package" ../..; done
sha256sum ./*.deb > SHA256SUMS
