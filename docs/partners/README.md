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

Visits, notes and partner changes are saved **in the browser on that device only**.
Use **Visits → Download backup** regularly, and **Restore backup** to move data to
another device. Clearing the browser's site data erases it. On iPhone, add the page to the
home screen (Share → Add to Home Screen) so Safari doesn't clear it after a week unused.

## Change the partner list

`partners.js` is the starting list (from `Outfield_Addresses_Upload.csv`). New entries
added there show up for everyone on their next visit; partners added on the site are only
on that device.

## Services used (free, no keys)

- Addresses are turned into map positions with OpenStreetMap's Nominatim, once per
  address, then saved in the browser.
- Driving times come from the public OSRM router. If it's unavailable, the route uses
  straight-line distances instead.
- Navigation opens in Google Maps.
