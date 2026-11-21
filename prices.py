"""Price checks for user-listed websites and the optional Source Gateway.

Only page addresses, caliber labels, wishlist make/model/caliber and an optional
search area leave this computer. Serial numbers, notes, receipts, photos and the
vault are never sent. Prices are read from schema.org Product/Offer JSON-LD that
many retailers publish for search engines; pages without it report "no prices
found" so the owner can see which sources need the Source Gateway instead.
"""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
import re
from urllib.parse import urljoin, urlsplit
import urllib.request

from photo_import import fetch_public

MAX_PAGES = 30
MAX_OFFERS_PER_PAGE = 120
PAGE_LIMIT = 4 * 1024 * 1024
USER_AGENT = 'PrivateInventory-PriceCheck/1.0'
GATEWAY_TIMEOUT = 90


class JsonLdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks, self._capture, self._buffer = [], False, []

    def handle_starttag(self, tag, attrs):
        if tag == 'script' and (dict(attrs).get('type') or '').lower().strip() == 'application/ld+json':
            self._capture, self._buffer = True, []

    def handle_data(self, data):
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self._capture:
            self._capture = False
            self.blocks.append(''.join(self._buffer))


def _types(node):
    value = node.get('@type', [])
    return {str(item).lower() for item in (value if isinstance(value, list) else [value])}


def _number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        found = re.search(r'[0-9][0-9,]*(?:\.[0-9]+)?', value)
        if found:
            return float(found.group(0).replace(',', ''))
    return None


def _text(value, limit=300):
    if isinstance(value, dict):
        value = value.get('name')
    return str(value).strip()[:limit] if isinstance(value, (str, int, float)) else ''


def _walk(node):
    if isinstance(node, list):
        for item in node:
            yield from _walk(item)
    elif isinstance(node, dict):
        yield node
        for key, value in node.items():
            if key not in ('offers',):
                yield from _walk(value)


def extract_offers(html, base_url):
    """Return [{title, price, currency, availability, url, seller}] from JSON-LD products."""
    parser = JsonLdParser()
    parser.feed(html)
    offers, seen = [], set()
    for block in parser.blocks:
        try:
            data = json.loads(block.strip().rstrip(';'))
        except ValueError:
            continue
        for node in _walk(data):
            if 'product' not in _types(node):
                continue
            title = _text(node.get('name'))
            raw = node.get('offers')
            for offer in (raw if isinstance(raw, list) else [raw]):
                if not isinstance(offer, dict):
                    continue
                price = _number(offer.get('price', offer.get('lowPrice')))
                if price is None and isinstance(offer.get('priceSpecification'), dict):
                    price = _number(offer['priceSpecification'].get('price'))
                if price is None or not 0 < price < 1_000_000 or not title:
                    continue
                link = offer.get('url') or node.get('url') or base_url
                link = urljoin(base_url, link) if isinstance(link, str) else base_url
                if urlsplit(link).scheme != 'https':
                    link = base_url
                item = dict(title=title, price=round(price, 2),
                            currency=_text(offer.get('priceCurrency'), 8) or 'USD',
                            availability=_text(offer.get('availability'), 80).rsplit('/', 1)[-1],
                            url=link, seller=_text(offer.get('seller'), 120))
                key = (item['title'], item['price'], item['url'])
                if key not in seen:
                    seen.add(key)
                    offers.append(item)
                if len(offers) >= MAX_OFFERS_PER_PAGE:
                    return offers
    return offers


def check_page(url):
    try:
        data, _kind, final = fetch_public(url, kinds=('text/html',), html_limit=PAGE_LIMIT, user_agent=USER_AGENT)
        offers = extract_offers(data.decode('utf-8', errors='replace'), final)
        return dict(url=url, ok=True, offers=offers,
                    note='' if offers else 'No machine-readable prices found on this page.')
    except ValueError as error:
        return dict(url=url, ok=False, offers=[], note=str(error))
    except Exception:
        return dict(url=url, ok=False, offers=[], note='The website could not be reached or blocked the request.')


def query_gateway(gateway_url, queries, near):
    """POST the minimal query to the configured Source Gateway. See docs/SOURCE_GATEWAY.md."""
    body = json.dumps(dict(version=1, queries=queries, near=near)).encode()
    request = urllib.request.Request(gateway_url, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=GATEWAY_TIMEOUT) as response:
        result = json.loads(response.read(8 * 1024 * 1024))
    offers = []
    for item in (result.get('offers') or [])[:1000]:
        if not isinstance(item, dict):
            continue
        price = _number(item.get('price'))
        link = item.get('url') if isinstance(item.get('url'), str) else ''
        if price is None or not link.startswith('https://'):
            continue
        offers.append(dict(title=_text(item.get('title')), price=round(price, 2),
                           currency=_text(item.get('currency'), 8) or 'USD', url=link,
                           availability=_text(item.get('availability'), 80),
                           seller=_text(item.get('seller'), 120), location=_text(item.get('location'), 120),
                           rounds=item.get('rounds') if isinstance(item.get('rounds'), int) else None,
                           query=_text(item.get('query'), 80)))
    return offers


def validate_request(payload):
    if not isinstance(payload, dict) or not set(payload) <= {'pages', 'queries', 'near'}:
        raise ValueError('Unexpected price-check fields.')
    pages = payload.get('pages', [])
    if not isinstance(pages, list) or len(pages) > MAX_PAGES or not all(
            isinstance(url, str) and url.startswith('https://') and len(url) <= 2048 for url in pages):
        raise ValueError(f'Supply up to {MAX_PAGES} HTTPS page addresses.')
    queries = payload.get('queries', [])
    allowed = {'id', 'kind', 'caliber', 'manufacturer', 'model'}
    if not isinstance(queries, list) or len(queries) > 100 or not all(
            isinstance(q, dict) and set(q) <= allowed and q.get('kind') in ('ammo', 'firearm')
            and all(isinstance(v, str) and len(v) <= 160 for v in q.values()) for q in queries):
        raise ValueError('Gateway queries may contain only kind, caliber, manufacturer, model and id.')
    near = payload.get('near', '')
    if not isinstance(near, str) or len(near) > 120:
        raise ValueError('Search area must be short text.')
    return list(dict.fromkeys(pages)), queries, near


def price_check(payload, gateway_url=None):
    pages, queries, near = validate_request(payload)
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(check_page, pages))
    gateway = None
    if gateway_url and queries:
        try:
            gateway = dict(ok=True, offers=query_gateway(gateway_url, queries, near), note='')
        except Exception:
            gateway = dict(ok=False, offers=[], note='Source Gateway did not respond.')
    elif queries:
        gateway = dict(ok=False, offers=[], note='Source Gateway is not configured yet.')
    return dict(pages=results, gateway=gateway)
