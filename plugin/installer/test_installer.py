"""Exercise installer transactions on Linux with mocked macOS utilities, not a Mac validation."""
import hashlib
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

payload = pathlib.Path(sys.argv[1]).resolve()
script = pathlib.Path(__file__).with_name('install-mac.sh').read_text()
with tempfile.TemporaryDirectory(prefix='sy1-installer-test-') as tmp:
    root = pathlib.Path(tmp)
    commands = root / 'commands'
    commands.mkdir()
    for folder in ('/bin', '/usr/bin'):
        for p in pathlib.Path(folder).iterdir():
            if p.is_file() and os.access(p, os.X_OK) and not (commands / p.name).exists():
                (commands / p.name).symlink_to(p)
    def mock(name, text):
        p = commands / name
        if p.is_symlink(): p.unlink()
        p.write_text('#!/bin/bash\n' + text + '\n')
        p.chmod(0o755)
    mock('uname', 'if [ "$1" = -s ]; then echo Darwin; else echo x86_64; fi')
    mock('sw_vers', 'echo 15.0')
    mock('pgrep', '[ "${DAW_RUNNING:-0}" = 1 ]')
    mock('osascript', 'cat >/dev/null; echo "$*" >>"$HOME/dialogs"')
    mock('codesign', '[ "${FAIL_INSTALL:-0}" != 1 ] || [[ "$*" != *"/Plug-Ins/"* || "$*" == *".sy1-stage"* ]]')
    mock('xattr', 'exit 0')
    # Match Apple's input-first syntax: -verify_arch consumes every later token.
    mock('lipo', '[ "$#" = 3 ] && [ -f "$1" ] && [ "$2" = -verify_arch ] && [[ "$3" = x86_64 || "$3" = arm64 ]]')
    mock('PlistBuddy', 'if [[ "$*" == *CFBundleIdentifier* ]]; then echo com.audiovido.sy1; else echo SY-1; fi')
    mock('ditto', 'if [ "$1" = -x ]; then /usr/bin/unzip -q "$3" -d "$4"; else /bin/cp -a "$1" "$2"; fi')
    contents = root / 'app/Contents'
    (contents / 'MacOS').mkdir(parents=True)
    (contents / 'Resources').mkdir()
    shutil.copyfile(payload, contents / 'Resources/SY-1-mac.zip')
    for prefix in ('/usr/libexec/', '/usr/bin/', '/bin/'):
        script = script.replace(prefix, str(commands) + '/')
    executable = contents / 'MacOS/install'
    executable.write_text(script)
    def run(name, flags=None, existing=False, expect=0):
        home = root / name
        home.mkdir()
        dests = [home / 'Library/Audio/Plug-Ins' / sub / ('SY-1.' + ext)
                 for sub, ext in [('VST3', 'vst3'), ('Components', 'component')]]
        if existing:
            for d in dests:
                d.mkdir(parents=True)
                (d / 'keep').write_text('previous working build')
        result = subprocess.run(['/bin/bash', str(executable)], env={**os.environ, 'HOME': str(home), **(flags or {})})
        assert (result.returncode == 0) == (expect == 0), (name, result.returncode)
        if expect == 0:
            for d in dests:
                assert (d / 'Contents/MacOS/SY-1').stat().st_mode & 0o111
            if existing:
                assert len(list((home / 'Library/Application Support/SY-1/Plugin Backups').rglob('keep'))) == 2
        elif existing:
            for d in dests: assert (d / 'keep').read_text() == 'previous working build'
        else:
            assert all(not d.exists() for d in dests)
        assert not list(home.rglob('.sy1-stage.*'))
        print(name, 'passed')
    run('clean install')
    run('replacement and backup', existing=True)
    run('failure rollback', {'FAIL_INSTALL': '1'}, existing=True, expect=1)
    run('DAW open blocks installation', {'DAW_RUNNING': '1'}, existing=True, expect=1)
    with (contents / 'Resources/SY-1-mac.zip').open('ab') as f: f.write(b'corrupted')
    run('corrupt payload rejected', expect=1)
