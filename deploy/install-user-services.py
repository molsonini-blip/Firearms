#!/usr/bin/env python3
"""Install current-user startup services without changing the host Tailscale service."""
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
UNITS = Path.home() / '.config/systemd/user'
STATE = Path.home() / '.local/state/private-inventory-tailnet'


def main():
    tailscaled = shutil.which('tailscaled')
    if not tailscaled:
        raise SystemExit('Tailscale must already be installed.')
    if not (STATE / 'tailscaled.state').exists():
        raise SystemExit('Authorize the app identity with python3 tailnet.py connect first.')
    UNITS.mkdir(parents=True, exist_ok=True)
    quote = json.dumps
    services = {
        'private-inventory-tailnet.service': f'''[Unit]
Description=Private inventory isolated Tailscale identity

[Service]
Type=simple
ExecStart={quote(tailscaled)} --tun=userspace-networking --statedir=%h/.local/state/private-inventory-tailnet --state=%h/.local/state/private-inventory-tailnet/tailscaled.state --socket=%h/.local/state/private-inventory-tailnet/tailscaled.sock --port=0
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
''',
        'private-inventory.service': f'''[Unit]
Description=Encrypted private inventory web application
Requires=private-inventory-tailnet.service
After=private-inventory-tailnet.service

[Service]
Type=simple
WorkingDirectory={ROOT}
ExecStartPre={quote(sys.executable)} {quote(str(ROOT / 'tailnet.py'))} wait
ExecStart={quote(sys.executable)} {quote(str(ROOT / 'tailnet.py'))} run
ExecStartPost={quote(sys.executable)} {quote(str(ROOT / 'tailnet.py'))} serve
Restart=on-failure
RestartSec=5
TimeoutStartSec=90
TimeoutStopSec=20
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=default.target
''',
    }
    for name, body in services.items():
        target = UNITS / name
        if target.exists() and target.read_text() != body:
            raise SystemExit(f'{target} already exists with different contents; review it before replacing.')
        target.write_text(body)
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', *services], check=True)
    print('Installed and enabled services. Stop any manually started app/sidecar before starting private-inventory.service.')
    print('Boot startup also requires user lingering; inspect with loginctl show-user "$USER" -p Linger.')


if __name__ == '__main__':
    main()
