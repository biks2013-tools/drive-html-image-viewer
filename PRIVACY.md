# Privacy Policy: Drive HTML & Image Viewer

_Last updated: 18 October 2026 (GitHub support added in version 1.3.0)_

Drive HTML & Image Viewer is a Chrome extension that displays HTML files and images stored in Google Drive, and
HTML files stored in GitHub repositories.

## What the extension does with data

- When you ask it to open a file, the extension downloads that file from Google Drive or GitHub into the memory of
  your browser and displays it. It uses the Google or GitHub session already signed in to your browser. For a
  GitHub HTML file, it also downloads the stylesheets, scripts and images that page references in the same
  repository.
- The file is never written to disk by the extension and is discarded when you close the viewer tab.
- For image formats your browser cannot display (HEIC, TIFF, RAW…), the extension asks Google Drive's own preview
  service to convert the image.

## What the extension does not do

- It does not collect, store, sell or share any personal data, file contents, browsing history or usage data.
- It has no analytics, tracking, advertising or remote code.
- It sends no data to the developer or to any third party. Its only network requests go to Google
  (`drive.google.com`, `drive.usercontent.google.com`, `lh3.google.com`, `*.googleusercontent.com`) or GitHub
  (`github.com`, `raw.githubusercontent.com`) to fetch the file you asked for. A rendered HTML page may itself load
  content from the web, as any web page does.
- It does not use `chrome.storage`, cookies of its own or any other persistent storage. Pages it renders get
  temporary in-memory storage that is discarded when the page closes.

## Permissions

The extension's permissions are used only to provide the feature above. They are explained in the
[README](https://github.com/BikS2013-tools/drive-html-image-viewer#permissions).

## Contact

For questions, open an issue at <https://github.com/BikS2013-tools/drive-html-image-viewer/issues>.
