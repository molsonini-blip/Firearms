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
