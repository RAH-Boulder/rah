// Settings for the Google Sheet sync. See README.md ("Google Sheet sync").
window.PARTNERS_CONFIG = {
  // The Apps Script web app URL (ends in /exec). Leave empty and the site asks for it
  // on each device instead.
  sheetUrl: "https://script.google.com/macros/s/AKfycby8cv8vB8CARRFsw9j2sZERWTDGgzbY0eSkTbpwhkeja74n6n4trrg9nznAXSKdYeCH/exec",
  // Link to the sheet itself, for the "Open the sheet" button.
  sheetLink: "https://docs.google.com/spreadsheets/d/1Q1X3haayr442C473qcWx1vCyIvRGo6oluwb00U_3QXY/edit",
  // Extra choices under Route > "Start from". lat/lng is the map position of the address.
  startPlaces: [
    { id: "riverbend", label: "4810 Riverbend Rd, Boulder", address: "4810 Riverbend Rd, Boulder, CO 80301", lat: 40.015486, lng: -105.234479 }
  ]
};
