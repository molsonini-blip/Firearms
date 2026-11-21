import base64
from http.client import HTTPConnection
import json
from pathlib import Path
import stat
import sys
import tempfile
import threading
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import VaultServer

FIXTURE = dict(version=1,kdf='PBKDF2-SHA256',iterations=600000,cipher='AES-256-GCM',
               salt=base64.b64encode(b'x'*16).decode(),iv=base64.b64encode(b'x'*12).decode(),
               ciphertext=base64.b64encode(b'x'*32).decode())


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name) / 'data'
        self.server = VaultServer(('127.0.0.1',0),self.data)
        self.worker = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.worker.join(); self.temp.cleanup()

    def request(self,method,path='/',body=None,headers=None):
        connection = HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        connection.request(method,path,body=body,headers=headers or {})
        response = connection.getresponse(); result = (response.status,dict(response.getheaders()),response.read())
        connection.close(); return result

    def test_host_origin_and_static_boundaries(self):
        status,headers,body = self.request('GET')
        self.assertEqual(status,200); self.assertIn(b'Private inventory',body)
        self.assertIn("connect-src 'self'",headers['Content-Security-Policy'])
        self.assertEqual(self.request('GET',headers={'Host':'evil.example'})[0],403)
        self.assertEqual(self.request('GET',headers={'Origin':'https://evil.example'})[0],403)
        for path in ('/data/vault.json','/server.py','/../server.py','/.git/config'):
            self.assertEqual(self.request('GET',path)[0],404)

    def test_encrypted_only_atomic_save_and_conflict_protection(self):
        payload = json.dumps(FIXTURE)
        headers = {'Content-Type':'application/json','X-Vault-Request':'1','If-None-Match':'*'}
        self.assertEqual(self.request('PUT','/api/vault',json.dumps({'serial':'plaintext'}),headers)[0],400)
        self.assertEqual(self.request('PUT','/api/vault',payload,{'Content-Type':'application/json'})[0],403)
        status,saved,_ = self.request('PUT','/api/vault',payload,headers)
        self.assertEqual(status,200)
        self.assertEqual(stat.S_IMODE((self.data/'vault.json').stat().st_mode),0o600)
        self.assertEqual(stat.S_IMODE(self.data.stat().st_mode),0o700)
        self.assertEqual(self.request('PUT','/api/vault',payload,headers)[0],409)
        headers.pop('If-None-Match'); headers['If-Match'] = saved['ETag']
        self.assertEqual(self.request('PUT','/api/vault',payload,headers)[0],200)
        self.assertEqual(json.loads(self.request('GET','/api/vault')[2]),FIXTURE)


if __name__ == '__main__':
    unittest.main()
