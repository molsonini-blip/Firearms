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

    def __init__(self, address, data_dir):
        self.data_dir = data_dir
        self.write_lock = threading.Lock()
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log request contents or sensitive paths.

    def allowed(self):
        expected = f'127.0.0.1:{self.server.server_port}'
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        return host == expected and (origin is None or origin == f'http://{expected}')

    def reply(self, code, body=b'', kind='application/json', etag=None):
        self.send_response(code)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'")
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


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data', help='Encrypted vault directory; override for isolated testing.')
    args = parser.parse_args()
    with VaultServer(('127.0.0.1', args.port), args.data_dir) as server:
        print(f'Private inventory: http://127.0.0.1:{server.server_port}', flush=True)
        print('Keep this terminal running. Ctrl+C stops the app.', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
