/**
 * Saves signed caregiver training forms to Google Drive.
 *
 * The carer-training site (docs/carer-training) posts each signed PDF here,
 * and this script saves it in the folder below as "First Last 2026.pdf".
 * Setup steps are in apps-script/README.md.
 */

// The "signed training forms" Google Drive folder.
const FOLDER_ID = "1emAPNqe9x38EnsDGDQfZXVAxJdW05lPD";

// Signed forms are about 0.5 MB; anything far bigger is not one of ours.
const MAX_BYTES = 10 * 1024 * 1024;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const name = cleanName(String(data.fileName || ""));
    if (!name) return reply({ ok: false, error: "missing file name" });

    const bytes = Utilities.base64Decode(String(data.pdf || ""));
    if (bytes.length > MAX_BYTES) return reply({ ok: false, error: "file too large" });
    // Every PDF starts with "%PDF".
    if (bytes.length < 4 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "%PDF") {
      return reply({ ok: false, error: "not a PDF" });
    }

    const blob = Utilities.newBlob(bytes, "application/pdf", name + ".pdf");
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    return reply({ ok: true, name: file.getName() });
  } catch (err) {
    return reply({ ok: false, error: "could not save" });
  }
}

// Letters, numbers, spaces, apostrophes and hyphens only; at most 100 characters.
function cleanName(name) {
  return name.replace(/[^\p{L}\p{N} '_-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
