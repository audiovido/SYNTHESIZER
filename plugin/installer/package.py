"""Build the offline Finder app without changing any plugin bytes (runs on Linux or Mac)."""
import hashlib
import pathlib
import plistlib
import shutil
import sys
import zipfile

payload, output = map(pathlib.Path, sys.argv[1:])
expected = 'b03afb0bcc3beea649eef67fa21084dfb869ca5ddc00dd098812f59fa87603cc'
assert hashlib.sha256(payload.read_bytes()).hexdigest() == expected, 'Unexpected payload'
app = output.parent / 'SY-1 Install 8c1f5c2.app'
contents = app / 'Contents'
(contents / 'MacOS').mkdir(parents=True, exist_ok=True)
(contents / 'Resources').mkdir(exist_ok=True)
shutil.copyfile(pathlib.Path(__file__).with_name('install-mac.sh'), contents / 'MacOS' / 'install')
(contents / 'MacOS' / 'install').chmod(0o755)
shutil.copyfile(payload, contents / 'Resources' / 'SY-1-mac.zip')
(contents / 'Info.plist').write_bytes(plistlib.dumps({
    'CFBundleExecutable': 'install', 'CFBundleIdentifier': 'com.audiovido.sy1.installer',
    'CFBundleName': 'SY-1 Install 8c1f5c2', 'CFBundlePackageType': 'APPL',
    'CFBundleVersion': '1', 'CFBundleShortVersionString': '8c1f5c2',
    'LSMinimumSystemVersion': '11.0', 'LSUIElement': True,
}))
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(app.rglob('*')):
        z.write(f, f.relative_to(output.parent))
print(output, output.stat().st_size, 'bytes')
