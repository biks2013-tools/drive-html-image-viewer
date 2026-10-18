# Chrome Web Store listing

Text and answers used for the Chrome Web Store submission. Images in this folder:
`screenshot-*.png` (1280×800) and `promo-small-440x280.png` (small promo tile). Store icon: `extension/icons/icon128.png`.

## Store listing

**Name** (from manifest): Drive HTML & Image Viewer

**Summary** (from manifest description, 127/132 chars):
Open HTML files and images (JPEG, PNG, SVG, HEIC, TIFF…) stored in Google Drive right in the browser, without downloading them.

**Category:** Productivity → Tools

**Language:** English

**Description:**

```
Google Drive shows HTML files as plain source text and asks you to download images it cannot preview. Drive HTML & Image Viewer opens them right in your browser instead.

HTML FILES
• Rendered as real web pages: CSS, scripts, web fonts and non-Latin text all work.
• Run in a sandboxed page, so a file's scripts cannot use your Google session.
• "View source" switches to the file's source text.

IMAGES
• Shown exactly as stored: JPEG, PNG, APNG, GIF, WebP, AVIF, BMP, ICO, SVG and SVGZ.
• Converted with Google Drive's own preview service: HEIC/HEIF (iPhone photos), TIFF, PSD, JPEG XL, JPEG 2000 and camera RAW (DNG, CR2, NEF, ARW…).
• Pixel size and file size shown; click to switch between fit-to-window and actual size.

HOW TO OPEN A FILE
• Double-click it in the Drive list, or select it and press Enter.
• Click the "Render HTML" / "View image" button that appears in Drive.
• Click the toolbar icon or press Alt+Shift+H.
• Right-click any Drive link (Gmail, Docs, Chat…) and choose "Open this Drive link in Drive Viewer".
Alt+double-click or Alt+Enter keeps Drive's own preview.

PRIVATE BY DESIGN
• Uses the Google account already signed in to your browser: no extra sign-in, OAuth app or API key.
• Opens only files your account can already open.
• Files are kept in memory only and never sent anywhere except Google.
• No analytics, tracking or data collection.

Open source (MIT): https://github.com/BikS2013-tools/drive-html-image-viewer
```

**Homepage URL:** https://github.com/BikS2013-tools/drive-html-image-viewer

**Support URL:** https://github.com/BikS2013-tools/drive-html-image-viewer/issues

## Privacy practices

**Single purpose:**
View HTML files and images stored in Google Drive directly in the browser, without downloading them.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `activeTab` | Reads the URL of the current tab when the user clicks the toolbar icon, presses the shortcut or uses the context menu, to find which Google Drive file to open. |
| `contextMenus` | Adds "Open this Drive link in Drive Viewer" to the right-click menu of Google Drive links. |
| Host permissions | `drive.google.com`: content script that adds double-click, Enter and a button to open HTML/image files, and access to Drive's preview renderer. `drive.usercontent.google.com`: downloads the file the user asked to open. `lh3.google.com` and `*.googleusercontent.com`: Drive's preview renderer serves converted images (HEIC, TIFF…) from these hosts. |

**Remote code:** No, I am not using remote code. (All scripts are packaged in the extension. HTML files the user opens are displayed in a sandboxed page as content, not executed as extension code.)

**Data usage:** No user data is collected. (Tick nothing in the data-type list.)

Certifications (all ticked):
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/BikS2013-tools/drive-html-image-viewer/blob/main/PRIVACY.md

## Distribution

**Visibility:** chosen at submission (Public / Unlisted / Private).
**Regions:** all regions.
