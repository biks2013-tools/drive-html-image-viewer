// Viewer page: downloads the Drive file with the user's signed-in session, then
// - hands HTML to the sandboxed iframe for rendering;
// - shows images directly (formats Chrome cannot decode go through Drive's own thumbnail renderer).

const $ = (id) => document.getElementById(id);
const frame = $("frame");
const params = new URLSearchParams(location.search);
const fileId = params.get("id");
const authuser = params.get("authuser");

let currentHtml = null;
let imageUrl = null;
let activeView = null; // the element shown when source is hidden: the iframe or the image view
let sandboxReady = false;
let pendingRender = false;

window.addEventListener("message", (event) => {
  if (event.source === frame.contentWindow && event.data?.type === "sandbox-ready") {
    sandboxReady = true;
    if (pendingRender) postToSandbox();
  }
});

function postToSandbox() {
  pendingRender = false;
  frame.contentWindow.postMessage({ html: currentHtml }, "*");
}

function renderInSandbox() {
  if (sandboxReady) postToSandbox();
  else pendingRender = true;
}

function setStatus(text) {
  $("status").textContent = text;
}

function showError(message) {
  setStatus("");
  frame.hidden = true;
  $("image-view").hidden = true;
  $("source").hidden = true;
  $("error").hidden = false;
  $("error").textContent = message;
}

function downloadUrls(id) {
  const user = authuser !== null ? `&authuser=${encodeURIComponent(authuser)}` : "";
  return [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download${user}`,
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}${user}`
  ];
}

function fileNameFrom(response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1]);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

// Honors the charset from the response header, then a <meta charset>, then UTF-8.
function decode(buffer, contentType) {
  let charset = (contentType.match(/charset=([^;]+)/i) ?? [])[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(buffer.slice(0, 2048));
    charset = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) ?? [])[1];
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

// Formats Chrome decodes itself.
const NATIVE_IMAGE_BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg", jpe: "image/jpeg", jfif: "image/jpeg", pjpeg: "image/jpeg", pjp: "image/jpeg",
  png: "image/png", apng: "image/apng", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", ico: "image/x-icon", cur: "image/x-icon", svg: "image/svg+xml", svgz: "image/svg+xml"
};
// Image formats Chrome cannot decode; Drive renders them to a JPEG/PNG thumbnail.
const CONVERTED_IMAGE_EXT = /^(tiff?|heic|heif|jxl|psd|ai|eps|dng|cr2|cr3|crw|nef|nrw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|raw|tga|jp2|j2k|jpf|jpx)$/;
const NATIVE_MIME = new Set(Object.values(NATIVE_IMAGE_BY_EXT));

function extensionOf(name) {
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function startsWith(bytes, signature, offset = 0) {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const ascii = (text) => [...text].map((c) => c.charCodeAt(0));

// Identifies the image format from the file's first bytes; null when it is not a known image.
function sniffImage(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 512));
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, ascii("GIF8"))) return "image/gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, ascii("BM"))) return "image/bmp";
  if (startsWith(bytes, [0, 0, 1, 0]) || startsWith(bytes, [0, 0, 2, 0])) return "image/x-icon";
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0]) || startsWith(bytes, [0x4d, 0x4d, 0, 0x2a])) return "image/tiff";
  if (startsWith(bytes, ascii("ftyp"), 4)) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (/^avi[fs]$/.test(brand)) return "image/avif";
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return "image/heic";
  }
  if (startsWith(bytes, ascii("8BPS"))) return "image/vnd.adobe.photoshop";
  const head = new TextDecoder("latin1").decode(bytes);
  if (/^\s*(﻿|\xEF\xBB\xBF)?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) return "image/svg+xml";
  return null;
}

// Returns {mime, native} for images, or null for anything else (rendered as HTML).
function imageTypeOf(name, buffer, contentType) {
  const ext = extensionOf(name);
  const sniffed = sniffImage(buffer);
  if (sniffed) return { mime: sniffed, native: NATIVE_MIME.has(sniffed) };
  if (ext === "svgz") return { mime: "image/svg+xml", native: true, gzipped: true };
  if (NATIVE_IMAGE_BY_EXT[ext]) return { mime: NATIVE_IMAGE_BY_EXT[ext], native: true };
  const headerMime = contentType.split(";")[0].trim().toLowerCase();
  if (CONVERTED_IMAGE_EXT.test(ext) || headerMime.startsWith("image/")) {
    return { mime: headerMime.startsWith("image/") ? headerMime : `image/${ext}`, native: NATIVE_MIME.has(headerMime) };
  }
  return null;
}

async function gunzip(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

// Drive's thumbnail service renders HEIC, TIFF, PSD, RAW… into a browser-friendly image.
// Loaded through <img> (not fetch) so the redirect to Google's image servers needs no CORS.
function driveRenderingUrl(id) {
  const user = authuser !== null ? `&authuser=${encodeURIComponent(authuser)}` : "";
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w4000-h4000${user}`;
}

function canDecode(url) {
  const probe = new Image();
  probe.src = url;
  return probe.decode().then(() => true, () => false);
}

function formatBytes(size) {
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit && value < 10 ? 1 : 0)} ${units[unit]}`;
}

async function showImage(name, buffer, type) {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  const bytes = type.gzipped ? await gunzip(buffer) : buffer;
  imageUrl = type.native ? URL.createObjectURL(new Blob([bytes], { type: type.mime })) : null;
  const converted = !imageUrl || !(await canDecode(imageUrl));
  const image = $("image");
  image.src = converted ? driveRenderingUrl(fileId) : imageUrl;
  try {
    await image.decode();
  } catch {
    throw new Error("Chrome cannot display this image format, and Drive did not provide a rendered preview of it.");
  }
  image.alt = name;
  setFitted(true);

  const isSvg = type.mime === "image/svg+xml";
  if (isSvg) $("source").textContent = new TextDecoder("utf-8").decode(bytes);
  $("toggle-source").hidden = !isSvg;
  setStatus(
    [
      `${image.naturalWidth}×${image.naturalHeight}`,
      formatBytes(buffer.byteLength),
      converted ? `${type.mime.replace("image/", "").toUpperCase()} shown via Drive's preview renderer` : null
    ]
      .filter(Boolean)
      .join(" · ")
  );
  activeView = $("image-view");
  showView();
}

// Fitted: scaled down to the window. Unfitted: actual pixels, scrollable.
function setFitted(fitted) {
  $("image-view").classList.toggle("fit", fitted);
}

$("image").addEventListener("click", () => setFitted(!$("image-view").classList.contains("fit")));

// A real file download carries Content-Disposition; Drive's own HTML pages
// (sign-in, "no access", virus-scan interstitial) do not.
async function fetchDriveFile(id) {
  let lastProblem = "";
  for (const url of downloadUrls(id)) {
    let response;
    try {
      response = await fetch(url, { credentials: "include", redirect: "follow" });
    } catch (error) {
      lastProblem = `Network error: ${error.message}`;
      continue;
    }
    if (/accounts\.google\.com/.test(response.url)) {
      lastProblem = "Drive asked for sign-in. Sign in to Google in this browser (with an account that can open the file) and reload.";
      continue;
    }
    if (!response.ok) {
      lastProblem =
        response.status === 404 || response.status === 403
          ? `Drive returned ${response.status}: the file does not exist or this Google account has no access to it.`
          : `Drive returned HTTP ${response.status}.`;
      continue;
    }
    const name = fileNameFrom(response);
    if (!name) {
      lastProblem =
        "Drive did not return the file contents (no download headers). The file may be a Google Docs/Sheets document rather than an uploaded .html file, or access is denied.";
      continue;
    }
    return { name, buffer: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "" };
  }
  throw new Error(lastProblem || "Could not download the file.");
}

async function load() {
  $("error").hidden = true;
  setStatus("Loading…");
  try {
    const { name, buffer, contentType } = await fetchDriveFile(fileId);
    $("file-name").textContent = name;
    $("reload").hidden = false;
    const imageType = imageTypeOf(name, buffer, contentType);
    if (imageType) {
      document.title = name;
      await showImage(name, buffer, imageType);
      return;
    }
    const html = decode(buffer, contentType);
    currentHtml = html;
    const title = new DOMParser().parseFromString(html, "text/html").title.trim();
    document.title = title ? `${title} — ${name}` : name;
    if (!/\.html?$/i.test(name)) setStatus("(not an .html file — rendering anyway)");
    else setStatus("");
    $("source").textContent = html;
    $("toggle-source").hidden = false;
    activeView = frame;
    showView();
    renderInSandbox();
  } catch (error) {
    showError(error.message);
  }
}

function showView() {
  $("source").hidden = true;
  frame.hidden = activeView !== frame;
  $("image-view").hidden = activeView !== $("image-view");
  $("toggle-source").textContent = "View source";
}

$("toggle-source").addEventListener("click", () => {
  if (!$("source").hidden) {
    showView();
  } else {
    $("source").hidden = false;
    activeView.hidden = true;
    $("toggle-source").textContent = activeView === frame ? "View rendered" : "View image";
  }
});

$("reload").addEventListener("click", () => {
  // Fresh sandbox document so the file's scripts start from a clean state.
  sandboxReady = false;
  frame.src = "sandbox.html";
  load();
});

function parseInput(value) {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return { id: trimmed, authuser: null };
  try {
    const url = new URL(trimmed);
    const pathMatch = url.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
    const id = pathMatch ? pathMatch[1] : url.searchParams.get("id");
    const userMatch = url.pathname.match(/\/u\/(\d+)\//);
    return id ? { id, authuser: url.searchParams.get("authuser") ?? (userMatch ? userMatch[1] : null) } : null;
  } catch {
    return null;
  }
}

$("picker-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const target = parseInput($("picker-input").value);
  if (!target) {
    $("picker-input").setCustomValidity("Not a recognizable Drive link or file ID");
    $("picker-input").reportValidity();
    return;
  }
  const next = new URLSearchParams({ id: target.id });
  if (target.authuser !== null) next.set("authuser", target.authuser);
  location.search = next.toString();
});
$("picker-input").addEventListener("input", () => $("picker-input").setCustomValidity(""));

if (fileId) {
  const drive = $("open-drive");
  drive.href = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view${authuser !== null ? `?authuser=${encodeURIComponent(authuser)}` : ""}`;
  drive.hidden = false;
  load();
} else {
  $("picker").hidden = false;
}
