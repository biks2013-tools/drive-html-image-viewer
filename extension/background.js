// Service worker: decides which Drive file to render and opens the viewer tab.

const DRIVE_LINK_PATTERNS = [
  "https://drive.google.com/*",
  "https://docs.google.com/*",
  "https://drive.usercontent.google.com/*"
];

// Extracts { id, authuser } from any common Drive URL shape.
function parseDriveUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) return null;

  const pathMatch = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{10,})/);
  const id = pathMatch ? pathMatch[1] : url.searchParams.get("id");
  if (!id || !/^[a-zA-Z0-9_-]{10,}$/.test(id)) return null;

  const userMatch = url.pathname.match(/\/u\/(\d+)\//);
  const authuser = url.searchParams.get("authuser") ?? (userMatch ? userMatch[1] : null);
  return { id, authuser };
}

function openViewer(target, openerTab) {
  const params = new URLSearchParams();
  if (target) {
    params.set("id", target.id);
    if (target.authuser !== null && target.authuser !== undefined) params.set("authuser", target.authuser);
  }
  const createProps = { url: chrome.runtime.getURL(`viewer.html?${params}`) };
  if (openerTab) {
    createProps.index = openerTab.index + 1;
    createProps.openerTabId = openerTab.id;
  }
  chrome.tabs.create(createProps);
}

// Resolves the file for a tab: URL first, then the item selected in the Drive file list.
async function resolveTarget(tab) {
  const fromUrl = parseDriveUrl(tab.url ?? "");
  if (fromUrl) return fromUrl;

  if ((tab.url ?? "").startsWith("https://drive.google.com/")) {
    try {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: "get-selected-file" });
      if (reply?.id) return reply;
    } catch {
      // Content script not present (e.g. tab opened before install) — fall through.
    }
  }
  return null;
}

async function renderFromTab(tab) {
  openViewer(await resolveTarget(tab), tab);
}

chrome.action.onClicked.addListener(renderFromTab);

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "render-html") return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) renderFromTab(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "render-drive-link",
    title: "Open this Drive link in Drive Viewer (HTML / image)",
    contexts: ["link"],
    targetUrlPatterns: DRIVE_LINK_PATTERNS
  });
  chrome.contextMenus.create({
    id: "render-drive-page",
    title: "Open this Drive file in Drive Viewer (HTML / image)",
    contexts: ["page"],
    documentUrlPatterns: DRIVE_LINK_PATTERNS
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "render-drive-link") {
    openViewer(parseDriveUrl(info.linkUrl), tab);
  } else if (info.menuItemId === "render-drive-page" && tab) {
    renderFromTab(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "open-viewer") openViewer(message.target, sender.tab);
});
