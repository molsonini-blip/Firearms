# Source Gateway integration

The app checks prices two ways:

1. **Direct website checks (works now).** Each website on the *Websites checked*
   list, and each product page on a wishlist item, is fetched by the local server
   through the same SSRF-protected fetcher used for photo imports. Prices are read
   from schema.org `Product`/`Offer` JSON-LD, which many retailers publish. Pages
   that render prices only with JavaScript, or that block automated requests,
   report "No machine-readable prices found" or "could not be reached". Those
   sources need the gateway.
2. **Source Gateway (when ready).** It scans the wider web and gun shops,
   starting from the owner's search area and expanding outward (R10). It is
   optional and pluggable.

## Enabling it

```sh
SOURCE_GATEWAY_URL=http://127.0.0.1:9100/search python3 server.py
# or
python3 server.py --source-gateway https://gateway.example/search
```

`tailnet.py run` inherits `SOURCE_GATEWAY_URL` from the environment. Only
`https://` URLs or `http://` loopback URLs are accepted. The app shows
"Source Gateway · Connected" on the *Ammo & deals* tab when it is configured.

## Request contract (app → gateway)

`POST` JSON, timeout 90 s:

```json
{
  "version": 1,
  "near": "City, ST or ZIP (may be empty)",
  "queries": [
    {"kind": "ammo", "id": "9mm", "caliber": "9mm Luger (9x19)"},
    {"kind": "firearm", "id": "<wishlist item id>", "manufacturer": "…", "model": "…", "caliber": "…"}
  ]
}
```

That is the whole payload. Serial numbers, names, notes, receipts, photos,
purchase details and price targets are never sent. The server rejects any other
field before contacting the gateway.

## Response contract (gateway → app)

```json
{"offers": [{
  "query": "9mm",               // echo the query id
  "title": "Brand 9mm Luger 115gr FMJ 1000 Rounds",
  "price": 229.00,              // total price, number
  "currency": "USD",
  "url": "https://…",           // required, HTTPS only
  "seller": "Shop name",
  "location": "Austin, TX",     // or "Online"
  "rounds": 1000,               // optional; otherwise parsed from title
  "availability": "InStock"     // optional
}]}
```

Up to 1,000 offers are read. The app computes price per round, matches offers to
the owner's calibers and wishlist, and flags **Good price** at or below the
owner's targets. Results are saved inside the encrypted vault.

## Alerts

Price targets live in the encrypted vault, so the server cannot scan in the
background while the vault is locked. Today, checks run when the owner chooses
**Check prices now**, and good prices are flagged in the app. For unattended
alerts (email, push), the gateway should own the schedule. Give it a separate
watch list (calibers and targets only) and let it notify the owner directly.
