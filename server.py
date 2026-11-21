#!/usr/bin/env python3
"""Loopback-only static application and opaque encrypted-vault storage."""
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import tempfile
import threading
from urllib.parse import urlsplit
from photo_import import import_photo

ROOT = Path(__file__).resolve().parent
MAX_SIZE = 48 * 1024 * 1024
FILES = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.mjs': ('app.mjs', 'text/javascript'),
         '/crypto.mjs': ('crypto.mjs', 'text/javascript'), '/style.css': ('style.css', 'text/css')}


def valid_envelope(value):
    if not isinstance(value, dict) or set(value) != {'version', 'kdf', 'iterations', 'cipher', 'salt', 'iv', 'ciphertext'}:
        return False
    if value['version'] != 1 or value['kdf'] != 'PBKDF2-SHA256' or value['iterations'] != 600000 or value['cipher'] != 'AES-256-GCM':
        return False
    try:
        return (len(base64.b64decode(value['salt'], validate=True)) == 16 and
                len(base64.b64decode(value['iv'], validate=True)) == 12 and
                len(base64.b64decode(value['ciphertext'], validate=True)) >= 16)
    except (ValueError, TypeError):
        return False


class VaultServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, data_dir, tailnet_origin=None, tailnet_user=None):
        self.data_dir = data_dir
        self.tailnet_origin = tailnet_origin
        self.tailnet_user = tailnet_user
        self.write_lock = threading.Lock()
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log request contents or sensitive paths.

    def allowed(self):
        expected = f'127.0.0.1:{self.server.server_port}'
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        proxied = any(self.headers.get(header) for header in ('Tailscale-User-Login', 'X-Forwarded-For', 'X-Forwarded-Host'))
        if not proxied and host == expected and origin in (None, f'http://{expected}'):
            return True
        configured = self.server.tailnet_origin
        return bool(configured and self.server.tailnet_user
                    and host in (expected, urlsplit(configured).netloc)
                    and origin in (None, configured)
                    and self.headers.get('Tailscale-User-Login') == self.server.tailnet_user)

    def reply(self, code, body=b'', kind='application/json', etag=None):
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'")
        if etag:
            self.send_header('ETag', etag)
        self.end_headers()
        self.wfile.write(body)

    @property
    def vault(self):
        return self.server.data_dir / 'vault.json'

    def do_GET(self):
        if not self.allowed():
            return self.reply(403)
        if self.path == '/api/vault':
            with self.server.write_lock:
                if not self.vault.exists():
                    return self.reply(404)
                data = self.vault.read_bytes()
            return self.reply(200, data, etag='"' + hashlib.sha256(data).hexdigest() + '"')
        if self.path not in FILES:
            return self.reply(404)
        filename, kind = FILES[self.path]
        self.reply(200, (ROOT / 'app' / filename).read_bytes(), kind)

    def do_PUT(self):
        if not self.allowed() or self.headers.get('X-Vault-Request') != '1':
            return self.reply(403)
        if self.path != '/api/vault':
            return self.reply(404)
        if self.headers.get('Content-Type') != 'application/json' or self.headers.get('Transfer-Encoding'):
            return self.reply(415)
        length = self.headers.get('Content-Length', '')
        if not re.fullmatch(r'[0-9]{1,10}', length) or not 0 < int(length) <= MAX_SIZE:
            return self.reply(413)
        self.connection.settimeout(15)
        try:
            data = self.rfile.read(int(length))
            if len(data) != int(length) or not valid_envelope(json.loads(data)):
                return self.reply(400)
        except (ValueError, TimeoutError):
            return self.reply(400)
        with self.server.write_lock:
            previous = self.vault.read_bytes() if self.vault.exists() else None
            if previous is None:
                if self.headers.get('If-None-Match') != '*':
                    return self.reply(409)
            elif self.headers.get('If-Match') != '"' + hashlib.sha256(previous).hexdigest() + '"':
                return self.reply(409)
            self.server.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(dir=self.server.data_dir)
            try:
                with os.fdopen(fd, 'wb') as output:
                    output.write(data)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, self.vault)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        self.reply(200, b'{}', etag='"' + hashlib.sha256(data).hexdigest() + '"')

    def do_POST(self):
        if not self.allowed() or self.headers.get('X-Vault-Request') != '1':
            return self.reply(403)
        if self.path != '/api/photo-import':
            return self.reply(404)
        length = self.headers.get('Content-Length', '')
        if self.headers.get('Content-Type') != 'application/json' or self.headers.get('Transfer-Encoding'):
            return self.reply(415)
        if not re.fullmatch(r'[0-9]{1,5}', length) or not 0 < int(length) <= 4096:
            return self.reply(413)
        self.connection.settimeout(15)
        try:
            payload = json.loads(self.rfile.read(int(length)))
            if not isinstance(payload, dict) or set(payload) != {'url'}:
                raise ValueError('Supply only the manufacturer page or image address.')
            data, kind, source = import_photo(payload['url'])
            result = dict(name='Manufacturer photo', type=kind, data=base64.b64encode(data).decode(), source=source)
            self.reply(200, json.dumps(result).encode())
        except ValueError as error:
            self.reply(400, json.dumps({'error': str(error)}).encode())
        except Exception:
            self.reply(502, json.dumps({'error': 'The website could not be reached. Try a direct image address or upload a photo.'}).encode())


class HTTPSRedirect(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        self.send_response(308)
        self.send_header('Location', self.server.target_origin + '/')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', '0')
        self.end_headers()

    do_HEAD = do_GET


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data', help='Encrypted vault directory; override for isolated testing.')
    parser.add_argument('--tailnet-origin', help='Exact HTTPS origin of the trusted Tailscale Serve endpoint.')
    parser.add_argument('--tailnet-user', help='Only this Tailscale login may use the remote endpoint.')
    parser.add_argument('--redirect-port', type=int, help='Optional loopback HTTP-to-HTTPS redirect listener for the app identity.')
    args = parser.parse_args()
    if bool(args.tailnet_origin) != bool(args.tailnet_user):
        parser.error('Supply both --tailnet-origin and --tailnet-user, or neither.')
    if args.tailnet_origin and not re.fullmatch(r'https://[a-z0-9-]+\.[a-z0-9-]+\.ts\.net(?::[0-9]+)?', args.tailnet_origin):
        parser.error('--tailnet-origin must be an exact HTTPS Tailscale hostname without a path.')
    if args.redirect_port and not args.tailnet_origin:
        parser.error('--redirect-port requires --tailnet-origin.')
    if args.redirect_port:
        redirect=ThreadingHTTPServer(('127.0.0.1',args.redirect_port),HTTPSRedirect)
        redirect.target_origin=args.tailnet_origin
        threading.Thread(target=redirect.serve_forever,daemon=True).start()
    with VaultServer(('127.0.0.1', args.port), args.data_dir, args.tailnet_origin, args.tailnet_user) as server:
        print(f'Private inventory: http://127.0.0.1:{server.server_port}', flush=True)
        print('Keep this terminal running. Ctrl+C stops the app.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
