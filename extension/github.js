// Content script for github.com: a "Render HTML" button on the page of an .html file.
// GitHub's own file view (code, blame, history) is left untouched; the rendering opens in a new tab.

const BLOB_HTML = /^\/[^/]+\/[^/]+\/blob\/.+\.html?$/i;

const button = document.createElement("button");
button.id = "dhv-render-button";
button.type = "button";
button.textContent = "Render HTML";
button.title = "Render this HTML file in a new tab (Alt+Shift+H)";
button.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "open-viewer", target: { github: location.pathname.slice(1) } });
});

// GitHub navigates between pages without reloading, so the button follows the current URL.
function refreshButton() {
  const show = BLOB_HTML.test(location.pathname);
  if (show && !button.isConnected) document.documentElement.appendChild(button);
  button.hidden = !show;
}

setInterval(refreshButton, 800);
refreshButton();
