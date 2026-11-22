# Validation — November 21, 2026

Passed automated checks:

- Three Node cryptography tests covering record/receipt round trips, no plaintext
  fields in the envelope, non-exportable key, nonce uniqueness, incorrect
  passphrases, tampering, rekeying, and invalid input.
- Two Python server tests covering local host/origin restrictions, static file
  allowlist, refusal to save plaintext records, atomic encrypted writes,
  owner-only permissions, and stale-tab conflict rejection.
- Python and JavaScript syntax checks.

Observed in the browser against a separate synthetic vault on port 8766:

- Unlocking, creating a synthetic record, storing a PNG receipt, searching by
  serial number, and reopening the editor.
- Manual locking, rejection of an incorrect passphrase, and reopening the saved
  vault with the test passphrase, retaining the record and receipt count.
- The real app on port 8765 remained at its Create vault screen. No real vault
  or passphrase was created by the agent.

Not fully exercised in the browser: restore/export downloads, passphrase change,
five-minute timer, receipt removal, deletion, mobile layout, large file limits,
OS crash durability, and multiple-tab conflict handling. Rekeying and stale writes
have automated coverage. There has been no independent security audit. Browser
testing used only synthetic data and a separate temporary encrypted file.

The local-model handoff used requirements only. Its output was reviewed as a
draft; it did not verify security or actual user inventory.

## Photo and private-network update

- Four Node tests now pass, including photo encryption and backward compatibility
  with records that have no photo.
- Eight Python tests now cover the server, photo importer, exact Tailnet
  origin/owner checks, and fixed HTTPS redirect target. Import tests cover private
  addresses, mixed public/private DNS answers, redirects to private addresses,
  page-image extraction, invalid image content, URL-only request payloads, and
  no unencrypted photo files being written by the importer.
- Browser testing on the separate synthetic vault confirmed upload preview,
  encrypted save, locking, and photo persistence after unlocking. A public
  manufacturer image import was also previewed and saved successfully.
- A public manufacturer homepage returned its preview logo in a direct importer
  test. This confirms page extraction; it does not establish that every page
  supplies the correct firearm image. Users must check the preview. Some sites
  require a direct image address or manual download/upload.
- The original 1-pixel receipt fixture was not a decodable image. The app rejected
  it without replacing the saved photo. Testing continued with a valid synthetic
  PNG, and errors/status are now visible within the editor dialog.
- Personal vault data was not read by the agent or sent to a model. UI testing
  remained isolated from the user's real vault.

The isolated `firearms` userspace Tailscale identity was approved by the user and
reported `Running` with DNS name `firearms.tail2080e6.ts.net`. Its first certificate
was successfully issued after supplying an explicit certificate/state directory.
Private HTTPS returned HTTP 200 with certificate validation enabled. An unrelated
Origin received HTTP 403. HTTP `firearms` returned a 308 redirect to the fixed HTTPS
name, and the browser followed `http://firearms/` to the app's vault setup screen.

These network checks ran from EdgeXpert's original Tailscale identity to the
separate app identity on that host. An off-host computer/phone has not been tested
by the agent; it must be connected to the tailnet with MagicDNS enabled and use
the same owner's Tailscale identity. No machine rename or host tagging was performed.

A temporary host-level Serve route was added during investigation. A local TLS
check encountered an existing LineupLedger certificate on the host address. The
route that had been added was specifically removed after rechecking it against
the empty original Serve configuration. Existing host services were not changed.
The app-specific userspace identity is intended to avoid that address conflict.

## Type and caliber update

Five Node cryptography tests pass. Added coverage verifies encrypted type/caliber
round trips, compatibility with existing records lacking these fields, and rejection
of unsupported types or invalid caliber data. JavaScript syntax and diff checks
passed. No backend or network configuration changed in this update.

## Managed startup on EdgeXpert

Installed and enabled current-user `private-inventory-tailnet.service` and
`private-inventory.service`. User lingering was already enabled. The existing
app-specific Tailscale state, certificate directory, and encrypted vault location
were reused. The host's primary Tailscale service was not modified.

Systemd unit validation passed. Restarting both services initially exposed an
owner-map loading race: Tailscale can report Running before its owner metadata
is available. The readiness check now waits for that metadata. Two targeted tests
pass for that condition and for rejection of a suffixed hostname collision.

After the fix, restarting both services completed successfully; both were active,
the app had zero automatic retry restarts, and private HTTPS returned HTTP 200.
The short HTTP name also returned the expected 308 redirect during initial
service cutover. Both units are enabled for startup. An actual computer reboot
was not performed. Boot availability remains dependent on network access, valid
Tailscale authorization, and the checkout staying at its configured location.

## Ammo, wishlist and price-check update

- Node: 8 tests (crypto + caliber catalog). New coverage: every catalog label maps
  to its own caliber, retail-title caliber/round-count parsing, encrypted
  wishlist/websites/targets/saved checks, and rejection of invalid sections.
- Python: 12 tests. New coverage: JSON-LD offer extraction (ItemList, Offer,
  AggregateOffer, relative URLs, malformed blocks), minimal-payload validation,
  per-page error reporting, gateway payload, and that the endpoint requires local
  requests and writes nothing to disk.
- Browser (headless Chrome, synthetic vault on port 8766, mock gateway on loopback):
  added firearms with and without caliber, ammo suggestions and *Add*, a wishlist
  item, a $/round target, a search area, and a website. A price check flagged
  the expected two good prices, and they persisted after lock/unlock. The gateway
  received only calibers, wishlist make/model/caliber and the area. The vault
  file held no plaintext. Live retailer pages were not reachable from the test
  sandbox, so real-site JSON-LD coverage remains for the owner to confirm.
