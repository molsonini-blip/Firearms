from pathlib import Path
import json
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prices import extract_offers, price_check, validate_request

PAGE = '''<html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
 {"@type":"ListItem","item":{"@type":"Product","name":"Synthetic 9mm Luger 115gr FMJ 1000 Rounds",
   "offers":{"@type":"Offer","price":"279.99","priceCurrency":"USD","availability":"https://schema.org/InStock","url":"/p/1"}}},
 {"@type":"ListItem","item":{"@type":["Product"],"name":"Synthetic .223 Rem 55gr 20rd",
   "offers":[{"@type":"AggregateOffer","lowPrice":9.5,"priceCurrency":"USD"}]}}]}
</script><script type="application/ld+json">not json</script></head></html>'''


class PriceTests(unittest.TestCase):
    def test_extracts_jsonld_products_and_offers(self):
        offers = extract_offers(PAGE, 'https://retailer.example/9mm')
        self.assertEqual(len(offers), 2)
        self.assertEqual(offers[0]['price'], 279.99)
        self.assertEqual(offers[0]['url'], 'https://retailer.example/p/1')
        self.assertEqual(offers[0]['availability'], 'InStock')
        self.assertEqual(offers[1]['price'], 9.5)
        self.assertEqual(offers[1]['url'], 'https://retailer.example/9mm')

    def test_request_accepts_only_minimal_fields(self):
        with self.assertRaises(ValueError): validate_request({'pages': ['http://plain.example']})
        with self.assertRaises(ValueError): validate_request({'pages': [], 'serial': 'x'})
        with self.assertRaises(ValueError): validate_request({'queries': [{'kind': 'ammo', 'serial': 'x'}]})
        with self.assertRaises(ValueError): validate_request({'pages': ['https://a.example/%d' % i for i in range(31)]})
        pages, queries, near = validate_request({'pages': ['https://a.example', 'https://a.example'],
                                                 'queries': [{'kind': 'ammo', 'id': '9mm', 'caliber': '9mm Luger'}], 'near': 'Austin, TX'})
        self.assertEqual(pages, ['https://a.example'])

    def test_price_check_reports_per_page_status_and_gateway(self):
        with patch('prices.fetch_public', side_effect=[(PAGE.encode(), 'text/html', 'https://retailer.example/9mm')]):
            result = price_check({'pages': ['https://retailer.example/9mm'], 'queries': [{'kind': 'ammo', 'caliber': '9mm'}]})
        self.assertTrue(result['pages'][0]['ok'])
        self.assertEqual(len(result['pages'][0]['offers']), 2)
        self.assertEqual(result['gateway']['note'], 'Source Gateway is not configured yet.')
        with patch('prices.fetch_public', side_effect=ValueError('Local, private, and reserved network addresses are not allowed.')):
            result = price_check({'pages': ['https://internal.example']})
        self.assertFalse(result['pages'][0]['ok'])
        sent = {}
        def fake_gateway(url, queries, near):
            sent.update(url=url, queries=queries, near=near)
            return [{'title': 'Synthetic 9mm 50rd', 'price': 14.0, 'url': 'https://shop.example/x', 'query': '9mm'}]
        with patch('prices.query_gateway', side_effect=fake_gateway):
            result = price_check({'queries': [{'kind': 'ammo', 'id': '9mm', 'caliber': '9mm Luger'}], 'near': 'Austin, TX'}, 'http://127.0.0.1:9000/search')
        self.assertEqual(sent['queries'], [{'kind': 'ammo', 'id': '9mm', 'caliber': '9mm Luger'}])
        self.assertTrue(result['gateway']['ok'])


if __name__ == '__main__':
    unittest.main()
