# Private inventory

A local web app for personal firearm ownership records. It stores display name,
manufacturer, model, serial number, purchase date, purchase price, notes, and
PDF/JPG/PNG receipts. No inventory data is sent to AI models or outside services.

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

## Everyday use

1. Unlock, then choose **Add firearm**. Enter ownership details and attach receipts.
2. Choose **Save encrypted record**. Details and receipts are encrypted together.
3. Search by name, manufacturer, model, or serial number. Use **View / edit** to
   update details, download a receipt, or delete a record.
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

## Privacy and security boundaries

- Browser-side Web Crypto uses AES-256-GCM with a random 96-bit nonce for each
  save, a random 128-bit salt, and PBKDF2-HMAC-SHA256 with 600,000 iterations.
- The passphrase and non-exportable encryption key are not saved. The key and
  decrypted records remain in browser memory only while unlocked. JavaScript
  memory clearing is best effort; this is not a secure hardware enclave.
- The server stores only an opaque encrypted envelope in `data/vault.json`.
  New files use owner-only access and are replaced atomically. Conditional writes
  reject stale edits from another tab.
- Application assets are local; there are no fonts, scripts, analytics, or cloud
  services loaded from outside the computer. The server binds to loopback and
  rejects other Host/Origin values. Browser policy blocks external connections,
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
