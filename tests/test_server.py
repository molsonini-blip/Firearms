import base64
from http.client import HTTPConnection
import json
from pathlib import Path
import stat
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import VaultServer, HTTPSRedirect, ThreadingHTTPServer

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

    def test_photo_import_requires_local_request_and_only_a_url(self):
        headers={'Content-Type':'application/json','X-Vault-Request':'1'}
        self.assertEqual(self.request('POST','/api/photo-import','{}',{'Content-Type':'application/json'})[0],403)
        with patch('server.import_photo',return_value=(b'photo','image/jpeg','https://manufacturer.example/photo')) as fetch:
            self.assertEqual(self.request('POST','/api/photo-import',json.dumps({'url':'https://manufacturer.example','serial':'do-not-send'}),headers)[0],400)
            fetch.assert_not_called()
            status,_,body=self.request('POST','/api/photo-import',json.dumps({'url':'https://manufacturer.example'}),headers)
            self.assertEqual(status,200)
            self.assertEqual(json.loads(body)['data'],base64.b64encode(b'photo').decode())
            self.assertFalse(self.data.exists())

    def test_price_check_endpoint_requires_local_request_and_minimal_payload(self):
        headers={'Content-Type':'application/json','X-Vault-Request':'1'}
        self.assertEqual(self.request('POST','/api/price-check','{}',{'Content-Type':'application/json'})[0],403)
        self.assertEqual(self.request('POST','/api/price-check',json.dumps({'pages':[],'serial':'x'}),headers)[0],400)
        with patch('server.price_check',return_value={'pages':[],'gateway':None}) as check:
            self.assertEqual(self.request('POST','/api/price-check',json.dumps({'pages':['https://shop.example']}),headers)[0],200)
            check.assert_called_once()
        status,_,body=self.request('GET','/api/price-config')
        self.assertEqual((status,json.loads(body)),(200,{'gateway':False}))
        self.assertEqual(self.request('GET','/ammo.mjs')[0],200)
        self.assertFalse(self.data.exists())

    def test_tailnet_requires_exact_origin_and_owner_identity(self):
        remote='inventory.tailtest.ts.net'
        headers={'Host':remote,'Origin':'https://'+remote,'Tailscale-User-Login':'owner@example.test'}
        self.assertEqual(self.request('GET',headers=headers)[0],403)
        self.server.tailnet_origin='https://'+remote
        self.server.tailnet_user='owner@example.test'
        self.assertEqual(self.request('GET',headers=headers)[0],200)
        self.assertEqual(self.request('GET',headers={**headers,'Tailscale-User-Login':'other@example.test'})[0],403)
        self.assertEqual(self.request('GET',headers={**headers,'Origin':'https://evil.example'})[0],403)
        self.assertEqual(self.request('GET',headers={'Host':remote})[0],403)
        self.assertEqual(self.request('GET',headers={'X-Forwarded-For':'100.64.0.5'})[0],403)
        self.assertEqual(self.request('GET',headers={'X-Forwarded-For':'100.64.0.5','Tailscale-User-Login':'owner@example.test'})[0],200)

    def test_short_http_address_redirects_only_to_fixed_https_origin(self):
        redirect=ThreadingHTTPServer(('127.0.0.1',0),HTTPSRedirect)
        redirect.target_origin='https://firearms.tailtest.ts.net'
        worker=threading.Thread(target=redirect.serve_forever,daemon=True); worker.start()
        try:
            connection=HTTPConnection('127.0.0.1',redirect.server_port,timeout=5)
            connection.request('GET','//evil.example/anything?private=value',headers={'Host':'firearms'})
            response=connection.getresponse()
            self.assertEqual(response.status,308)
            self.assertEqual(response.getheader('Location'),'https://firearms.tailtest.ts.net/')
            self.assertEqual(response.read(),b'')
            connection.close()
        finally:
            redirect.shutdown(); redirect.server_close(); worker.join()


if __name__ == '__main__':
    unittest.main()
