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
| R03 | Record caliber in firearm specifications. | Implemented as Caliber / gauge. This is a manually entered descriptive field. |
| R04 | Record firearm type: Pistol, Revolver, Rifle, or Shotgun. | Implemented as a dropdown; existing records may remain Not specified. |
| R05 | Include a firearm picture, with a choice of finding it on the manufacturer's website or uploading a personal photo. | Partially implemented: local upload and import from a supplied manufacturer product-page or image URL. Automatic manufacturer discovery/search is not implemented. Imported previews require user confirmation. |
| R06 | Record recommended ammunition for each firearm. | Not implemented. The caliber field does not constitute an ammunition recommendation feature. |
| R07 | Track ammunition prices across many websites and notify the owner when a good price is offered. | Not implemented. No price monitoring or purchase alerts exist. |
| R08 | Maintain a wishlist of firearms the owner would like to buy. | Not implemented. Ownership records are not a wishlist. |
| R09 | Track wishlist firearm prices and alert the owner at a good price point. | Not implemented. |
| R10 | Scan US gun shops for firearms or ammunition the owner is looking for, beginning locally and expanding geographically. | Not implemented. No shop discovery, availability scanning, or geographic expansion exists. |
| R11 | Consider Source Gateway as a possible component for that scanning request. | User suggestion recorded; no integration or implementation decision was made. |
| R12 | Allow the owner to manually add websites to be checked. | Not implemented. The one-time photo-import URL field is not a monitored website list. |
| R13 | Show the complete list of websites being checked and where they are located. | Not implemented. No monitored-source directory or checking-status view exists. |
| R14 | Encrypt the information and require a passcode/passphrase so others cannot read it. | Implemented with browser-side encryption, passphrase unlock, and automatic locking, subject to the security boundaries below. This is not a guarantee against every form of access. |
| R15 | Make the application accessible through the `firearms` name across the owner's Tailscale network while it runs on EdgeXpert. | Configured: `http://firearms/` redirects to the private HTTPS app identity. The backend checks the owner's Tailscale identity, and the vault still requires its passphrase. Off-host device testing remains for the owner. |
| R16 | Keep the project code, documentation, and requirements in the supplied GitHub repository. | Implemented. Personal records and credentials are excluded. |
| R17 | Preserve the complete requested requirements even when a feature is not implemented. | Recorded in this document. The owner explicitly authorized documentation without implementation. |

## Decisions that remain unspecified

The owner has not supplied exact definitions for a "good price," alert delivery
preferences, the initial local search area, geographic expansion boundaries, or
specific websites. These are unresolved requirements, not values chosen by the
implementation. This document contains no seller list or implementation plan
for the unimplemented purchasing-related features.

## Implementation boundary and additional features

The current implementation covers private ownership recordkeeping and access.
The purchasing-related features above were not implemented because of the
assistant's assistance restrictions. That limitation belongs to the assistant's
implementation scope; it does not change or erase the owner's requests.

The application also includes encrypted backup export/restore, receipt downloads,
photo resizing/metadata removal, and passphrase changes. These support the
implemented inventory; they do not satisfy the unimplemented requirements.

Encryption protects saved vault contents while locked. It does not protect an
unlocked screen or compromised browser/operating system. Receipt downloads are
decrypted copies. There is no passphrase recovery and no independent security
audit. EdgeXpert and the application must remain running; automatic startup after
reboot is not configured. See [README](../README.md) for operation and security
details and [validation](VALIDATION.md) for actual test coverage.

## Source and history

Source: the owner's initial project request and subsequent photo, website
scanning, Tailscale naming, caliber/type, and documentation requests in this chat
on November 21, 2026. This is a requirements record, not a verbatim chat transcript.

`context.json` and `local-model-handoff.json` capture the earlier, narrower pilot
handoff. They are historical inputs/outputs and do not contain the complete owner
requirements. This document is the complete requirements reference as of this date.
