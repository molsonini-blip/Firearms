# User requirements

Recorded November 21, 2026 from the project owner's requests in the Codex chat.
Spelling is normalized; the requested scope is preserved. This document records
the owner's requirements separately from what the current application implements.
A requirement marked unimplemented remains part of the owner's requested scope;
it has not been withdrawn or satisfied by a different feature.

## Purpose and access

Provide a private web application for managing the owner's firearm information.
Run the application on EdgeXpert and allow the owner to access the same inventory
from other computers connected to their Tailscale network. The requested short
browser address is `firearms`.

## Requirements and current status

| ID | User requirement | Current status |
| --- | --- | --- |
| R01 | Track firearms currently owned. | Implemented: create, view, edit, delete, and search ownership records. |
| R02 | Store serial number, purchase date, a copy of the receipt, and basic firearm information. | Implemented, including manufacturer, model, purchase price, and notes. |
| R03 | Record caliber in firearm specifications. | Implemented as a multi-select Caliber / gauge dropdown of the catalog calibers plus an "Other" text box, a *Caliber missing* tag, and a missing-caliber filter. |
| R04 | Record firearm type: Pistol, Revolver, Rifle, or Shotgun. | Implemented as a dropdown; existing records may remain Not specified. |
| R05 | Include a firearm picture, with a choice of finding it on the manufacturer's website or uploading a personal photo. | Partially implemented: local upload and import from a supplied manufacturer product-page or image URL. Automatic manufacturer discovery/search is not implemented. Imported previews require user confirmation. |
| R06 | Record recommended ammunition for each firearm. | Implemented: local catalog of common factory loads and safety cautions per caliber, shown in the editor and on Ammo & deals; encrypted *Preferred ammunition* field per firearm. |
| R07 | Track ammunition prices across many websites and notify the owner when a good price is offered. | Partially implemented: on-demand checks of listed websites (schema.org JSON-LD prices) plus the Source Gateway adapter; per-caliber $/round targets; good prices flagged in-app. Background/push alerts await the gateway (see SOURCE_GATEWAY.md). |
| R08 | Maintain a wishlist of firearms the owner would like to buy. | Implemented: encrypted wishlist with make, model, type, caliber, target price, notes, and watched product pages. |
| R09 | Track wishlist firearm prices and alert the owner at a good price point. | Partially implemented: watched product pages and gateway results compared to the target price and flagged in-app. Background alerts await the gateway. |
| R10 | Scan US gun shops for firearms or ammunition the owner is looking for, beginning locally and expanding geographically. | Delegated to Source Gateway: the app sends the search area and queries; discovery and geographic expansion are the gateway's job. Not active until the gateway is ready. |
| R11 | Consider Source Gateway as a possible component for that scanning request. | Integration point implemented (`--source-gateway` / `SOURCE_GATEWAY_URL`) with a documented request/response contract in SOURCE_GATEWAY.md. |
| R12 | Allow the owner to manually add websites to be checked. | Implemented: up to 25 websites (name, address, location, ammo/firearms/both), encrypted. |
| R13 | Show the complete list of websites being checked and where they are located. | Implemented: *Websites checked* table with location, category, and last-check result, including wishlist pages and the gateway. |
| R14 | Encrypt the information and require a passcode/passphrase so others cannot read it. | Implemented with browser-side encryption, passphrase unlock, and automatic locking, subject to the security boundaries below. This is not a guarantee against every form of access. |
| R15 | Make the application accessible through the `firearms` name across the owner's Tailscale network while it runs on EdgeXpert. | Configured: `http://firearms/` redirects to the private HTTPS app identity. The backend checks the owner's Tailscale identity, and the vault still requires its passphrase. Off-host device testing remains for the owner. |
| R16 | Keep the project code, documentation, and requirements in the supplied GitHub repository. | Implemented. Personal records and credentials are excluded. |
| R17 | Preserve the complete requested requirements even when a feature is not implemented. | Recorded in this document. The owner explicitly authorized documentation without implementation. |

## Decisions that remain unspecified

A "good price" is owner-defined: a $/round target per caliber and a target
price per wishlist item. The search area is an owner setting. Alert delivery
(email/push), geographic expansion limits and the website list remain the owner's
choices. No sellers or price thresholds are preset.

## Implementation boundary and additional features

The implementation now covers ownership records, suggested ammunition, a
wishlist, and price checks. Wider web/shop scanning and unattended alerts depend on
the Source Gateway.

The application also includes encrypted backup export/restore, receipt downloads,
photo resizing/metadata removal, and passphrase changes. These support the
implemented inventory; they do not satisfy the unimplemented requirements.

Encryption protects saved vault contents while locked. It does not protect an
unlocked screen or compromised browser/operating system. Receipt downloads are
decrypted copies. There is no passphrase recovery and no independent security
audit. EdgeXpert must remain powered on. Automatic startup after reboot is now
configured through current-user services; reauthorization may still be needed
if the app's Tailscale identity expires. See [README](../README.md) for operation and security
details and [validation](VALIDATION.md) for actual test coverage.

## Source and history

Source: the owner's initial project request and subsequent photo, website
scanning, Tailscale naming, caliber/type, and documentation requests in this chat
on November 21, 2026. This is a requirements record, not a verbatim chat transcript.

`context.json` and `local-model-handoff.json` capture the earlier, narrower pilot
handoff. They are historical inputs/outputs and do not contain the complete owner
requirements. This document is the complete requirements reference as of this date.
