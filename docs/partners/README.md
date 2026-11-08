# Referral Partners CRM

A small static site for visiting referral partners (like Outfield). No server, no build step.

- **Partners** — every partner, grouped by city. Search by name or address, filter by city,
  sort by name, city, or longest since your last visit. Tap a partner for its visit history
  and notes (contacts, best times to visit).
- **Check in** — log a visit: date and time, type, who you saw, notes, and an optional
  follow-up date. Due and overdue follow-ups show at the top of the Visits tab.
- **Route** — tap **+ Route** on partners, choose where you start and finish, and tap
  **Find best route**. The site puts the stops in the quickest order and gives you
  **Open in Google Maps** links (Google allows up to 10 stops per link, so longer routes
  are split into parts).
- **Visits** — every visit, newest first, searchable, downloadable as a CSV spreadsheet.

## Where data is kept

Everything is saved in the browser first, so the site works without signal. When a device is
connected to the **Google Sheet** (Visits tab → Google Sheet), changes sync to the sheet a
few seconds after you make them and whenever the site is opened, so all your devices share
the same visits, notes and partner list. Setup: `apps-script/README.md` ("Referral
partners sheet"). The badge next to **+ Add partner** shows whether this device is synced.

The script's URL is in `config.js`. Keep the Google Sheet itself private (Share → General access → Restricted); the site doesn't need the sheet to be shared.

**Visits → Erase data from this device** removes all visits, notes, the route and the passcode
from that device (for shared computers or a lost/replaced phone). It syncs first, and warns
if any changes haven't reached the sheet.

**Visits → Download backup** saves a file copy; **Restore backup** loads it (and sends it
to the sheet if connected).

## Change the partner list

`partners.js` is the starting list (from `Outfield_Addresses_Upload.csv`). New entries
added there show up for everyone on their next visit; partners added on the site are only
synced to the sheet (or kept on that device if it isn't connected). You can also add
partners as rows in the sheet's Partners tab.

## Route start places

Extra choices under **Route → Start from** (like 4810 Riverbend Rd) are in `config.js`
as `startPlaces`, each with its address and map position.

## Services used (free, no keys)

- Map positions for the partners in `partners.js` are saved in that file. Only partners
  added later (or with a changed address) are looked up with OpenStreetMap's Nominatim,
  once, then saved in the browser.
- Driving times come from the public OSRM router. If it's unavailable, the route uses
  straight-line distances instead.
- Navigation opens in Google Maps.
