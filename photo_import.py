"""Fetch a public HTTPS photo or a product page's preview image without disk storage."""
from html.parser import HTMLParser
from http.client import HTTPSConnection
import ipaddress
import socket
import ssl
from urllib.parse import urlsplit, urljoin

MAX_IMAGE = 8 * 1024 * 1024


def public_target(url):
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) < 33 for c in url):
        raise ValueError('Enter a valid public HTTPS address.')
    parts = urlsplit(url)
    if parts.scheme != 'https' or not parts.hostname or parts.username or parts.password or parts.port not in (None, 443):
        raise ValueError('Only public HTTPS addresses on the standard port are supported.')
    host = parts.hostname.encode('idna').decode('ascii')
    addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
        raise ValueError('Local, private, and reserved network addresses are not allowed.')
    return host, addresses[0][4][0], parts.path or '/', parts.query


class PinnedHTTPS(HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=12, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # Use the validated address without resolving again; retain TLS hostname validation.
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def fetch_public(url):
    for _ in range(4):
        host, address, path, query = public_target(url)
        connection = PinnedHTTPS(host, address)
        try:
            connection.request('GET', path + ('?' + query if query else ''), headers={
                'User-Agent': 'PrivateInventory-PhotoImport/1.0',
                'Accept': 'image/jpeg,image/png,image/webp,text/html;q=0.5',
                'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location:
                    raise ValueError('The website returned an incomplete redirect.')
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ValueError('The website did not provide a photo. Download it yourself and use Upload photo.')
            kind = response.getheader('Content-Type', '').split(';')[0].strip().lower()
            if kind not in ('image/jpeg', 'image/png', 'image/webp', 'text/html'):
                raise ValueError('The address must provide a JPG, PNG, WebP image or a product page.')
            limit = 1024 * 1024 if kind == 'text/html' else MAX_IMAGE
            data = response.read(limit + 1)
            if kind == 'text/html':
                data = data[:limit]  # Preview metadata is normally in the document head.
            elif len(data) > limit:
                raise ValueError('The page or photo is too large. Use a photo up to 8 MB.')
            return data, kind, url
        finally:
            connection.close()
    raise ValueError('Too many redirects. Use a direct image address or upload a photo.')


class PreviewParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta' and (values.get('property') or values.get('name', '')).lower() in (
                'og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'):
            if values.get('content'):
                self.images.append(values['content'])


def import_photo(url):
    data, kind, source = fetch_public(url)
    if kind == 'text/html':
        parser = PreviewParser()
        parser.feed(data.decode('utf-8', errors='replace'))
        if not parser.images:
            raise ValueError('No preview photo was found. Copy the image address from the manufacturer website or upload a photo.')
        data, kind, source = fetch_public(urljoin(source, parser.images[0]))
    valid = ((kind == 'image/jpeg' and data.startswith(b'\xff\xd8\xff')) or
             (kind == 'image/png' and data.startswith(b'\x89PNG\r\n\x1a\n')) or
             (kind == 'image/webp' and data.startswith(b'RIFF') and data[8:12] == b'WEBP'))
    if not valid:
        raise ValueError('This is not a supported photo. Try uploading a JPG, PNG, or WebP image.')
    return data, kind, source
