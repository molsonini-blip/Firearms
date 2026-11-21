from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from photo_import import public_target, import_photo, PreviewParser, fetch_public


def address(value):
    return [(2,1,6,'',(value,443))]


class PhotoTests(unittest.TestCase):
    def test_rejects_non_https_credentials_private_and_mixed_dns(self):
        for url in ('http://manufacturer.example/a.jpg','https://user:password@manufacturer.example/a.jpg',
                    'https://manufacturer.example:8765/a.jpg','https://manufacturer.example/\nheader'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                public_target(url)
        for values in (address('127.0.0.1'),address('169.254.169.254'),address('192.168.1.1'),
                       address('93.184.216.34')+address('10.0.0.1')):
            with patch('photo_import.socket.getaddrinfo',return_value=values), self.assertRaises(ValueError):
                public_target('https://manufacturer.example/photo.jpg')
        with patch('photo_import.socket.getaddrinfo',return_value=address('93.184.216.34')):
            host,ip,path,query=public_target('https://manufacturer.example/photo.jpg?size=1')
            self.assertEqual((host,ip,path,query),('manufacturer.example','93.184.216.34','/photo.jpg','size=1'))

    def test_product_page_preview_and_direct_image_validation(self):
        png=b'\x89PNG\r\n\x1a\nsynthetic'
        with patch('photo_import.fetch_public',side_effect=[
            (b'<meta property="og:image" content="/assets/photo.png">','text/html','https://manufacturer.example/model'),
            (png,'image/png','https://manufacturer.example/assets/photo.png')]) as fetch:
            self.assertEqual(import_photo('https://manufacturer.example/model'),(png,'image/png','https://manufacturer.example/assets/photo.png'))
            self.assertEqual(fetch.call_args.args[0],'https://manufacturer.example/assets/photo.png')
        with patch('photo_import.fetch_public',return_value=(b'<script>bad</script>','image/png','https://manufacturer.example/photo')):
            with self.assertRaises(ValueError): import_photo('https://manufacturer.example/photo')
        with patch('photo_import.fetch_public',return_value=(b'<html>No image</html>','text/html','https://manufacturer.example/model')):
            with self.assertRaises(ValueError): import_photo('https://manufacturer.example/model')

    def test_redirect_cannot_reach_private_address(self):
        class Response:
            status=302
            def getheader(self,name): return 'https://private.example/photo'
        class Connection:
            def request(self,*args,**kwargs): pass
            def getresponse(self): return Response()
            def close(self): pass
        with patch('photo_import.socket.getaddrinfo',side_effect=[address('93.184.216.34'),address('127.0.0.1')]), \
             patch('photo_import.PinnedHTTPS',return_value=Connection()) as connect:
            with self.assertRaises(ValueError): fetch_public('https://manufacturer.example/photo')
            self.assertEqual(connect.call_count,1)
