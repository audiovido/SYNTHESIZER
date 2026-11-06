#!/bin/bash
# Finder-launchable installer. The payload is immutable, checksum-pinned, and offline.
set -eo pipefail
umask 077
VERSION=8c1f5c2
SHA256=b03afb0bcc3beea649eef67fa21084dfb869ca5ddc00dd098812f59fa87603cc
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
WORK=""
BACKUP=""
STAGED=()
TARGETS=()
OLD=()
CHANGED=()
COMMITTED=0
dialog() {
  /usr/bin/osascript - "$1" <<'APPLESCRIPT'
on run argv
  display dialog (item 1 of argv) with title "SY-1 · 8c1f5c2" buttons {"OK"} default button "OK"
end run
APPLESCRIPT
}
finish() {
  code=$?
  trap - EXIT
  if [ "$COMMITTED" = 0 ]; then
    for ((i=${#CHANGED[@]}-1; i>=0; i--)); do
      idx=${CHANGED[$i]}
      /bin/rm -rf "${TARGETS[$idx]}"
      if [ -n "${OLD[$idx]}" ]; then
        /bin/mv "${OLD[$idx]}" "${TARGETS[$idx]}" || code=2
      fi
    done
  fi
  for p in "${STAGED[@]}"; do [ ! -e "$p" ] || /bin/rm -rf "$p"; done
  [ -z "$WORK" ] || /bin/rm -rf "$WORK"
  if [ "$code" != 0 ]; then
    dialog "نصب انجام نشد. نسخهٔ قبلی تا جای ممکن بازگردانده شد. گزارش خطا: $LOG" || true
  fi
  exit "$code"
}
LOGDIR="$HOME/Library/Logs/SY-1"
/bin/mkdir -p "$LOGDIR"
LOG="$LOGDIR/install-$(date +%Y%m%d-%H%M%S)-$$.log"
exec >>"$LOG" 2>&1
trap finish EXIT
echo "SY-1 installer $VERSION"
[ "$(/usr/bin/uname -s)" = Darwin ] || { echo 'macOS is required'; exit 1; }
major=$(/usr/bin/sw_vers -productVersion | /usr/bin/cut -d. -f1)
[ "$major" -ge 11 ] || { dialog 'این نسخه به macOS 11 یا بالاتر نیاز دارد.'; exit 1; }
# Never close a DAW or overwrite a plugin while it is loaded.
if /usr/bin/pgrep -if '/(Ableton Live[^/]*\.app|Live[^/]*\.app|Logic Pro[^/]*\.app|SY-1\.app)/Contents/MacOS/' >/dev/null; then
  dialog 'ابتدا Ableton، Logic و SY-1 را ببندید؛ سپس نصب‌کننده را دوباره باز کنید.'
  exit 1
fi
ACTUAL=$(/usr/bin/shasum -a 256 "$RES/SY-1-mac.zip" | /usr/bin/awk '{print $1}')
[ "$ACTUAL" = "$SHA256" ] || { echo 'Payload checksum mismatch'; exit 1; }
/usr/bin/unzip -tq "$RES/SY-1-mac.zip"
WORK=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/sy1-install.XXXXXXXX")
/usr/bin/ditto -x -k "$RES/SY-1-mac.zip" "$WORK"
ARCH=$(/usr/bin/uname -m)
for ext in vst3 component; do
  SOURCES=()
  while IFS= read -r -d '' p; do SOURCES+=("$p"); done < <(/usr/bin/find "$WORK" -type d -name "SY-1.$ext" -print0)
  [ "${#SOURCES[@]}" = 1 ] || { echo "Expected exactly one SY-1.$ext"; exit 1; }
  src=${SOURCES[0]}
  plist="$src/Contents/Info.plist"
  [ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist")" = com.audiovido.sy1 ]
  exe=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
  [ "$exe" = SY-1 ] && [ -x "$src/Contents/MacOS/$exe" ]
  /usr/bin/lipo "$src/Contents/MacOS/$exe" -verify_arch "$ARCH"
  /usr/bin/codesign --verify --deep --strict "$src"
  if [ "$ext" = vst3 ]; then sub=VST3; else sub=Components; fi
  dir="$HOME/Library/Audio/Plug-Ins/$sub"
  /bin/mkdir -p "$dir"
  [ ! -L "$dir/SY-1.$ext" ] || { echo 'Refusing a symlink destination'; exit 1; }
  stage=$(/usr/bin/mktemp -d "$dir/.sy1-stage.XXXXXXXX")
  STAGED+=("$stage")
  /usr/bin/ditto "$src" "$stage/SY-1.$ext"
  /usr/bin/diff -qr "$src" "$stage/SY-1.$ext"
  /usr/bin/codesign --verify --deep --strict "$stage/SY-1.$ext"
  TARGETS+=("$dir/SY-1.$ext")
done
BACKUP="$HOME/Library/Application Support/SY-1/Plugin Backups/$(date +%Y%m%d-%H%M%S)-$$"
/bin/mkdir -p "$BACKUP"
# Both plugins are fully staged and verified before either installed plugin is changed.
for ((i=0; i<${#TARGETS[@]}; i++)); do
  dest=${TARGETS[$i]}
  base=$(/usr/bin/basename "$dest")
  old=""
  if [ -e "$dest" ]; then
    old="$BACKUP/$base"
    /usr/bin/ditto "$dest" "$old"
    /usr/bin/diff -qr "$dest" "$old"
  fi
  OLD+=("$old")
done
for ((i=0; i<${#TARGETS[@]}; i++)); do
  dest=${TARGETS[$i]}
  base=$(/usr/bin/basename "$dest")
  CHANGED+=("$i")
  /bin/rm -rf "$dest"
  /bin/mv "${STAGED[$i]}/$base" "$dest"
  # Remove only the download quarantine on these checksum-verified plugin copies.
  # Gatekeeper and every other security setting remain enabled.
  /usr/bin/xattr -r -d com.apple.quarantine "$dest" 2>/dev/null || true
  /usr/bin/codesign --verify --deep --strict "$dest"
  [ -x "$dest/Contents/MacOS/SY-1" ]
done
# Verify installed bytes against the original extracted bundles, including resources.
for ((i=0; i<${#TARGETS[@]}; i++)); do
  base=$(/usr/bin/basename "${TARGETS[$i]}")
  src=$(/usr/bin/find "$WORK" -type d -name "$base" -print -quit)
  /usr/bin/diff -qr "$src" "${TARGETS[$i]}"
done
echo "Installed AU and VST3 $VERSION; previous bundles: $BACKUP"
COMMITTED=1
dialog 'نصب AU و VST3 نسخهٔ 8c1f5c2 انجام شد. اکنون Ableton را باز کنید و SY-1 را از بخش Plug-ins انتخاب کنید.' || true
