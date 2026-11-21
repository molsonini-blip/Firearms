# Private inventory

A local web app for personal firearm ownership records. It stores display name,
manufacturer, model, type, caliber/gauge, serial number, purchase date, purchase price, notes, and
PDF/JPG/PNG receipts, and one photo per firearm. No inventory fields or photos are
sent to AI models. Optional website imports send only the supplied address to
the chosen website; private Tailscale access serves encrypted records to your
authorized devices.

## Start

Requires Python 3.10+ and a modern browser with Web Crypto. No Python or JavaScript
packages need to be installed to use the app.

```sh
python3 server.py
```

Open **http://127.0.0.1:8765/** on the same computer. Keep the terminal running;
Ctrl+C stops the app. Always use that address, including the same port. The server
deliberately rejects other hostnames and does not expose a network address.

Choose your own passphrase when creating the vault. Use at least 14 characters,
ideally four or more unrelated words. There is no recovery or password reset.
The project does not come with a real vault, password, or sample personal records.

## Private access from other computers

The optional setup uses a separate userspace Tailscale identity named `firearms`
on the same host, without renaming EdgeXpert or modifying its existing Tailscale
device. It uses Tailscale Serve and does not enable public Funnel access.

First-time authorization (sign in to your own Tailscale account when prompted):

```sh
python3 tailnet.py connect
```

After authorization, stop any existing `server.py` instance before starting the
same vault with its remote access controls:

```sh
python3 tailnet.py run
```

In another terminal:

```sh
python3 tailnet.py serve
```

On another computer connected to the same tailnet, with MagicDNS enabled, open
**http://firearms/**. It redirects to the app's full HTTPS Tailscale name. A bare
word in the browser address bar may launch a search; include `http://` or the
trailing slash. Certificate validation stays enabled and the encrypted vault
still requires your passphrase. The remote endpoint only accepts the app device
owner's Tailscale login via Serve's identity header, plus an exact trusted origin.
Other permitted tailnet users do not gain inventory access through this app.

Tailscale assigns the final device name. If `firearms` is already taken, resolve
that collision in the Tailscale admin console; the helper refuses to silently use
a suffixed name. The local computer and browser must be trusted. Other local
processes can spoof proxy headers, so the backend must stay on loopback and must
not be exposed through another proxy that forwards untrusted identity headers.

App identity state and private daemon logs are outside the repository under
`~/.local/state/private-inventory-tailnet` (or `$XDG_STATE_HOME`). They must never
be copied into GitHub or AI prompts. The app uses the installed `tailscale` and
`tailscaled` binaries. No automatic boot service is installed. After a host
restart, run `python3 tailnet.py daemon`, then `python3 tailnet.py run`; Serve's
saved private routes resume with the app identity.

The separate HTTP redirect listener binds only to loopback port 8767 and serves
no records; Tailscale maps the app identity's HTTP port 80 to it. HTTPS maps to
the existing inventory backend at loopback port 8765. All clients share the same
encrypted vault; this is remote access, not separate browser copies or cloud sync.

See the official [Tailscale Serve documentation](https://tailscale.com/docs/features/tailscale-serve).

## Everyday use

1. Unlock, then choose **Add firearm**. Enter ownership details and attach receipts.
2. Choose **Save encrypted record**. Details and receipts are encrypted together.
3. Search by name, manufacturer, model, or serial number. Use **View / edit** to
   update details, download a receipt, or delete a record.

The **Type** dropdown offers Pistol, Revolver, Rifle, and Shotgun (or Not specified).
**Caliber / gauge** is a descriptive field: copy the marking or manufacturer manual
information for your record. Both fields are encrypted and searchable. Existing
records open with empty values until you edit and save them; no migration is needed.
4. Export an **encrypted backup**, and store a copy on a separate device. Local
   storage is not a backup; disk failure can destroy the vault. The app does not
   automatically make historical backups.
5. Lock when finished. The app also locks after five minutes idle and when the
   page is hidden. Unsaved edits are discarded on lock.

Restore from the locked screen: select an encrypted backup, enter that backup's
passphrase, and confirm replacement if there is already a vault. Replacement and
deletion cannot be undone without a separate backup. Changing your passphrase
re-encrypts the current vault; older exported backups retain their old passphrase.

Receipt downloads are **decrypted copies**. Protect or remove those copies
separately. Maximums: 8 MB per receipt, 10 receipts per record, approximately 46 MB
for the encrypted vault. Receipts are downloaded rather than rendered as active content.

### Record photos

Open a record to upload a JPG, PNG, or WebP photo up to 8 MB, or paste an official
manufacturer product-page or direct image address and choose **Find photo**.
Product pages must expose a supported Open Graph/Twitter preview image. The
preview may be a brand logo or the wrong variant: check it before saving. Some
websites block imports; download the photo and upload it as an alternative.

The app does not search the web automatically or verify that a supplied domain
belongs to a manufacturer. It never sends serial numbers, notes, receipts, or
other inventory fields with the request. The contacted website/CDN can see the
requested URL and the host's public network address. Import requests send no
browser cookies, credentials, or referring page, and do not write an unencrypted
photo to disk.

Photos are re-encoded in the browser to JPEG at a maximum dimension of 1600 pixels
to remove original EXIF/location metadata. They are encrypted with the record
and included in encrypted backups. Existing photo-free vaults remain compatible.
Removing or changing a photo takes effect only after saving the record. Photo
previews and their browser blob URLs are cleared when locking the vault.

## Privacy and security boundaries

- Browser-side Web Crypto uses AES-256-GCM with a random 96-bit nonce for each
  save, a random 128-bit salt, and PBKDF2-HMAC-SHA256 with 600,000 iterations.
- The passphrase and non-exportable encryption key are not saved. The key and
  decrypted records remain in browser memory only while unlocked. JavaScript
  memory clearing is best effort; this is not a secure hardware enclave.
- The server stores only an opaque encrypted envelope in `data/vault.json`.
  New files use owner-only access and are replaced atomically. Conditional writes
  reject stale edits from another tab.
- Application assets are local; there are no external fonts, scripts, or analytics.
  Only an explicitly requested photo import contacts a public website from the
  server. The server binds to loopback and rejects unexpected Host/Origin values.
  The optional Tailscale endpoint additionally restricts the remote user identity.
  Browser policy blocks external connections,
  framing, and inline scripts. Requests are not logged.
- Encryption protects a locked vault from casual reading of the saved file. It
  does not protect against malware, malicious browser extensions, a compromised
  operating system, modified application code, screen capture, or someone using
  the unlocked app. Use device login, disk encryption, updates, and a strong
  unique passphrase. No claim of an independent security audit is made.
- Other local programs may still access or damage the encrypted file. The local
  server is not a multi-user access-control boundary. Keep separate backups.
- Never put personal records, receipt images, credentials, backups, or vault
  files into GitHub or an AI prompt. `data/` is ignored by Git.
- Website imports accept only public HTTPS addresses, validate each redirect,
  pin the validated IP for the TLS connection, enforce size limits, and reject
  private/reserved addresses and non-image content. This follows the
  [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

The KDF work factor follows the browser-compatible PBKDF2 option in the
[OWASP password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Authenticated encryption follows the
[OWASP storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html).
These references do not constitute an audit or certification of this application.

## Development and validation

Node 20+ is needed only for the cryptography tests:

```sh
node tests/crypto.test.mjs
python3 -m unittest discover -s tests
```

The automated tests cover encrypted receipt round trips, wrong passphrases,
tampering, random nonces, rekeying, invalid data, host/origin restrictions,
protected files, encrypted-only writes, owner-only permissions, and stale writes.

For isolated UI testing, start a separate instance with a separate encrypted vault:

```sh
python3 server.py --port 8766 --data-dir /tmp/private-inventory-test
```

See [validation](docs/VALIDATION.md) for observed browser coverage and remaining
limits. See [workflow](docs/WORKFLOW.md) for the LiteLLM/Ollama pilot used here.

Scope is ownership recordkeeping. The app does not include firearm/ammunition
sourcing, price comparison, purchase alerts, or purchasing recommendations.
