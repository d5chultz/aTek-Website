/**
 * ==============================================================================
 * WLOB COMMUNITY FAVORITES — GOOGLE APPS SCRIPT
 * Connects the WLOB photo library to your Google Spreadsheet.
 * ==============================================================================
 *
 * HOW TO INSTALL IN 60 SECONDS:
 * 1. Open your spreadsheet:
 *    https://docs.google.com/spreadsheets/d/1-3NjJI75malBBNZ9DsQ4mmEtstLH3KgkXWNN5R3HVE8/edit
 * 2. Click "Extensions" -> "Apps Script" in the top menu.
 * 3. Delete any code in Code.gs and paste this entire script.
 * 4. Click the blue "Deploy" button at the top right -> "New deployment".
 * 5. Click the gear icon next to "Select type" and select "Web app".
 * 6. Set:
 *    - Description: "WLOB Favorites API"
 *    - Execute as: "Me (schultzy@gmail.com)"
 *    - Who has access: "Anyone"
 * 7. Click "Deploy" (authorize access if prompted).
 * 8. Copy the "Web app URL" (it looks like https://script.google.com/macros/s/.../exec).
 * 9. Provide that URL to the assistant to plug into tuner.html!
 */

function doGet(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1") || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var lastRow = sheet.getLastRow();
    var votes = {};
    var leaderboard = [];

    if (lastRow > 1) {
      var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
      for (var i = 0; i < data.length; i++) {
        var file = String(data[i][0]).trim();
        var count = parseInt(data[i][1], 10) || 0;
        var name = String(data[i][2] || "").trim();
        if (file) {
          votes[file] = count;
          leaderboard.push({ file: file, votes: count, name: name });
        }
      }
      leaderboard.sort(function(a, b) { return b.votes - a.votes; });
    }

    var output = JSON.stringify({
      ok: true,
      totalTracked: leaderboard.length,
      votes: votes,
      leaderboard: leaderboard
    });

    return ContentService.createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    var payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (_) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    var file = String(payload.file || payload.filename || "").trim();
    var action = String(payload.action || "add").toLowerCase();
    var name = String(payload.name || "").trim();

    if (!file) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Missing filename" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1") || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var lastRow = sheet.getLastRow();
    var rowIndex = -1;
    var currentVotes = 0;

    if (lastRow > 1) {
      var filesRange = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < filesRange.length; i++) {
        if (String(filesRange[i][0]).trim().toLowerCase() === file.toLowerCase()) {
          rowIndex = i + 2; // Sheet 1-indexed, starting after header
          currentVotes = parseInt(filesRange[i][1], 10) || 0;
          break;
        }
      }
    }

    var newVotes = currentVotes;
    if (action === "add" || action === "upvote" || action === "favorite") {
      newVotes = currentVotes + 1;
    } else if (action === "remove" || action === "downvote" || action === "unfavorite") {
      newVotes = Math.max(0, currentVotes - 1);
    }

    var nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 2).setValue(newVotes);
      if (name) sheet.getRange(rowIndex, 3).setValue(name);
      sheet.getRange(rowIndex, 4).setValue(nowStr);
    } else {
      sheet.appendRow([file, newVotes, name, nowStr, ""]);
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      file: file,
      votes: newVotes,
      action: action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
