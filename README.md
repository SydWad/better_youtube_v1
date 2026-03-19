# Better Youtube

A Chrome/Brave browser extension that gives you full control over your YouTube browsing experience. Filter content by type, length, or keyword, and maintain a permanent portable watch history that YouTube cannot reset.

## Features

- Hide previously watched videos using a custom persistent watch history list
- Automatically capture videos marked "Not Interested" as watched
- Count partially watched videos as watched (configurable threshold)
- Filter videos by length (minimum and maximum)
- Hide YouTube Shorts, including the Shorts sidebar button and channel tab
- Hide playlists and mix recommendations
- Hide members-only content
- Hide live streams
- Hide videos by keyword or phrase (word blacklist)
- Control filtering per page: home feed, subscriptions, channel pages, search results, and sidebars independently
- Export and import your watch history as a portable categorized .txt file
- Retrieve your full existing YouTube watch history via the built-in history importer
- Enable or disable the entire extension with a single button

## Installation

1. Download or clone this repository
2. Open `chrome://extensions` or `brave://extensions`
3. Enable **Developer Mode**
4. Click **Load unpacked** and select the extension folder
5. Navigate to YouTube — the extension is active immediately

## Usage

Click the extension icon to open the popup panel. All filtering options are available there. Right-click the icon and select **Options** for advanced settings including watch history management, word blacklist, and import/export.

## Data & Privacy

All data is stored locally on your device using `chrome.storage.local`. No data is ever transmitted to any server. No analytics, telemetry, or tracking of any kind is present. See [PRIVACY.md](PRIVACY.md) for full details.

## License

MIT — see [LICENSE](LICENSE)

## Disclaimer

This extension is not affiliated with, endorsed by, or connected to YouTube or Google LLC in any way. YouTube is a trademark of Google LLC.
