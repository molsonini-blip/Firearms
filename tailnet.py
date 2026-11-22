#!/usr/bin/env python3
"""Isolated userspace Tailscale identity for this app, preserving the host's identity."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

STATE = Path(os.environ.get('XDG_STATE_HOME', str(Path.home() / '.local/state'))) / 'private-inventory-tailnet'
SOCKET = STATE / 'tailscaled.sock'


def command(*args, **kwargs):
    return subprocess.run(['tailscale', f'--socket={SOCKET}', *args], **kwargs)


def status():
    result=command('status','--json',capture_output=True,text=True)
    if result.returncode:
        raise RuntimeError('The app Tailscale identity is not running. Start its daemon first.')
    return json.loads(result.stdout)


def daemon():
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    STATE.chmod(0o700)
    try:
        status()
        print('App Tailscale daemon is already running.'); return
    except RuntimeError:
        pass
    executable=shutil.which('tailscaled')
    if not executable:
        raise RuntimeError('Install Tailscale before starting the app identity.')
    fd=os.open(STATE/'daemon.log',os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
    with os.fdopen(fd,'ab') as log:
        process=subprocess.Popen([executable,'--tun=userspace-networking',f'--statedir={STATE}',f'--state={STATE / "tailscaled.state"}',
                                  f'--socket={SOCKET}','--port=0'],stdout=log,stderr=log,start_new_session=True)
    for _ in range(30):
        if process.poll() is not None:
            raise RuntimeError(f'App Tailscale daemon stopped. Inspect the private log in {STATE}.')
        try:
            data=status()
            if data.get('BackendState') not in (None,'NoState'):
                print(f'App Tailscale daemon ready: {data["BackendState"]}'); return
        except RuntimeError:
            time.sleep(0.2)
    raise RuntimeError('App Tailscale daemon did not become ready.')


def details():
    data=status()
    if data.get('BackendState') != 'Running':
        raise RuntimeError('Authorize the app identity first: python3 tailnet.py connect')
    own=data['Self']
    host=own['DNSName'].rstrip('.')
    if not host.startswith('firearms.'):
        raise RuntimeError(f'Tailscale assigned {host}. Resolve the name conflict before continuing.')
    user=((data.get('User') or {}).get(str(own['UserID'])) or {}).get('LoginName')
    if not user:
        raise RuntimeError('App Tailscale owner identity is still loading.')
    return host,user


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('daemon','connect','status','serve','run','wait'))
    args=parser.parse_args()
    if args.action=='daemon': daemon()
    elif args.action=='connect':
        daemon()
        return command('up','--hostname=firearms','--accept-dns=false','--accept-routes=false').returncode
    elif args.action=='wait':
        for _ in range(120):
            try:
                details()
                return 0
            except (RuntimeError, KeyError):
                time.sleep(0.5)
        raise RuntimeError('App identity did not become ready. Check python3 tailnet.py status and reauthorize if necessary.')
    elif args.action=='status':
        data=status()
        print(json.dumps({'state':data.get('BackendState'),'name':data.get('Self',{}).get('DNSName')},indent=2))
    elif args.action=='serve':
        host,_=details()
        for flags in (('--bg','--https=443','http://127.0.0.1:8765'),('--bg','--http=80','http://127.0.0.1:8767')):
            result=command('serve',*flags)
            if result.returncode: return result.returncode
        print(f'App URL: https://{host}/ ; short address: http://firearms/')
    else:
        host,user=details()
        return subprocess.call([sys.executable,str(Path(__file__).with_name('server.py')),
                                '--tailnet-origin',f'https://{host}','--tailnet-user',user,'--redirect-port','8767'])
    return 0


if __name__=='__main__':
    try: sys.exit(main())
    except (RuntimeError,OSError,KeyError,ValueError) as error:
        print(f'App Tailscale setup: {error}',file=sys.stderr); sys.exit(1)
