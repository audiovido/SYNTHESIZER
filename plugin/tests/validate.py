"""Run the unmodified validator; retain verbose output and capture hung auval stacks.

No tests are skipped, retried, or given a longer timeout. Diagnostic sampling does
not change the child processes. pluginval still owns the 300-second timeout.
"""
import pathlib
import subprocess
import sys
import time

log = pathlib.Path(sys.argv[1])
log.parent.mkdir(parents=True, exist_ok=True)
with log.open('w') as output:
    child = subprocess.Popen(sys.argv[2:], stdout=output, stderr=subprocess.STDOUT)
    start = time.monotonic()
    sampled = set()
    while child.poll() is None:
        elapsed = time.monotonic() - start
        for limit in (120, 240, 300):
            if elapsed < limit or limit in sampled:
                continue
            sampled.add(limit)
            with log.with_suffix(f'.{limit}.stacks.txt').open('w') as diag:
                subprocess.run(['ps', '-axo', 'pid,ppid,etime,state,command'], stdout=diag, stderr=diag)
                found = subprocess.run(['pgrep', '-x', 'auvaltool'], capture_output=True, text=True)
                for pid in found.stdout.split():
                    subprocess.run(['sample', pid, '2', '-file', str(log.with_suffix(f'.{limit}.{pid}.sample.txt'))], stdout=diag, stderr=diag)
        time.sleep(1)
    sys.exit(child.returncode)
