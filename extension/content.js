// Content script for drive.google.com:
// - double-clicking (or pressing Enter on) an .html/.htm file or an image opens it in the viewer
//   (Alt+double-click / Alt+Enter keep Drive's preview);
// - a "Render HTML" / "View image" button appears when such a file is open, selected or previewed.

const HTML_NAME = /\.html?$/i;
const IMAGE_NAME =
  /\.(jpe?g|jpe|jfif|pjpe?g|pjp|png|apng|gif|webp|avif|bmp|ico|cur|svgz?|tiff?|heic|heif|jxl|psd|ai|eps|dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|raw|tga|jp2|j2k|jpf|jpx)$/i;
const isSupported = (name) => HTML_NAME.test(name) || IMAGE_NAME.test(name);
const FILE_ID = /^[a-zA-Z0-9_-]{10,}$/;
let lastClicked = null;
let lastOpenedAt = 0;

function authuserFromLocation() {
  const match = location.pathname.match(/\/u\/(\d+)\//);
  return new URLSearchParams(location.search).get("authuser") ?? (match ? match[1] : null);
}

function idFromLocation() {
  const match = location.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{10,})/);
  return match ? match[1] : null;
}

// Drive rows concatenate name, owner, date…; the file name is the leaf element ending in an extension.
function nameOfRow(row) {
  for (const el of row.querySelectorAll("*")) {
    if (el.childElementCount === 0 && isSupported(el.textContent.trim())) return el.textContent.trim();
  }
  return (row.getAttribute("aria-label") || "").trim();
}

function fileOfElement(el) {
  const row = el?.closest?.('[data-id][role="row"], [data-id][role="gridcell"], [data-id][role="option"]') ??
    el?.closest?.("[data-id]");
  const id = row?.getAttribute("data-id");
  return id && FILE_ID.test(id) ? { id, name: nameOfRow(row) } : null;
}

// Returns the file the user means: the open file (URL), else the selected row, else the last clicked one.
function currentFile() {
  const urlId = idFromLocation();
  if (urlId) return { id: urlId, name: document.title.replace(/\s*-\s*Google Drive\s*$/, "") };
  const selected = fileOfElement(document.querySelector('[data-id][aria-selected="true"]'));
  if (selected) return selected;
  return lastClicked;
}

function openViewer(file) {
  if (Date.now() - lastOpenedAt < 1000) return;
  lastOpenedAt = Date.now();
  chrome.runtime.sendMessage({ type: "open-viewer", target: { id: file.id, authuser: authuserFromLocation() } });
}

function interceptDoubleClick(event) {
  if (event.altKey || event.button !== 0) return;
  const file = fileOfElement(event.target);
  if (!file || !isSupported(file.name)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openViewer(file);
}

window.addEventListener(
  "mousedown",
  (event) => {
    const file = fileOfElement(event.target);
    if (file) lastClicked = file;
    if (event.detail === 2) interceptDoubleClick(event);
  },
  true
);
window.addEventListener("dblclick", interceptDoubleClick, true);

// Enter on a focused/selected file in the Drive list does what double-click does (Alt+Enter keeps Drive's preview).
function isEditable(el) {
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]'));
}

// With several files selected, Enter stays Drive's (it opens them all).
function fileForEnter(event) {
  const selected = document.querySelectorAll('[data-id][aria-selected="true"]');
  if (selected.length > 1) return null;
  // Focus may sit on the list container rather than the row; fall back to the selected row.
  return fileOfElement(event.target) ?? (selected.length === 1 ? fileOfElement(selected[0]) : null);
}

window.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Enter" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditable(event.target) || document.querySelector('[role="dialog"]:not([aria-hidden="true"])')?.contains(event.target)) return;
    const file = fileForEnter(event);
    if (!file || !isSupported(file.name)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openViewer(file);
  },
  true
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get-selected-file") {
    const file = currentFile();
    sendResponse(file ? { id: file.id, authuser: authuserFromLocation() } : null);
  }
});

// Floating button, shown only when the current file is HTML or an image.
const button = document.createElement("button");
button.id = "dhv-render-button";
button.type = "button";
button.textContent = "Render HTML";
button.addEventListener("click", () => {
  const file = currentFile();
  if (file) openViewer(file);
});

function refreshButton() {
  const file = currentFile();
  const show = Boolean(file && isSupported(file.name));
  if (show) {
    const isHtml = HTML_NAME.test(file.name);
    button.textContent = isHtml ? "Render HTML" : "View image";
    button.title = `${isHtml ? "Render this HTML file" : "View this image"} (Alt+Shift+H)`;
    if (!button.isConnected) document.documentElement.appendChild(button);
  }
  button.hidden = !show;
}

setInterval(refreshButton, 800);
