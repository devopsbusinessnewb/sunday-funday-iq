CBS Pick'em IQ Bridge v0.5

Scans Picks, Weekly Standings, and current CBS Sports NFL Odds, then exports one JSON file for Pick'em IQ.

Completed-week pool archive:
1. Open CBS Weekly Standings.
2. Select the completed week in the CBS week dropdown.
3. Click "Capture Selected Completed Week" in the extension.
4. Wait for the capture-complete message, then export the JSON.

The completed-week mode scrolls the standings table vertically and horizontally so every participant's picks and confidence values can be archived. Sunday Funday IQ removes participant names by default when it normalizes the export.

Replace the contents of Sunday Funday IQ\extensions\cbs-pickem-bridge with this package, then reload the unpacked extension in chrome://extensions.
