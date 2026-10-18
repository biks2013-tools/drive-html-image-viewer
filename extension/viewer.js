// Viewer page: downloads the file (from Google Drive, or from a GitHub repository) with the user's
// signed-in session, then
// - hands HTML to the sandboxed iframe for rendering (for GitHub, relative assets are resolved from the repo);
// - shows images directly (formats Chrome cannot decode go through Drive's own thumbnail renderer).

const $ = (id) => document.getElementById(id);
const frame = $("frame");
const params = new URLSearchParams(location.search);
const fileId = params.get("id");
const authuser = params.get("authuser");
// GitHub file as "owner/repo/blob/<ref>/<path>" (the github.com path of the file page).
const githubPath = params.get("gh");
const github = githubPath ? githubFile(githubPath) : null;

let currentHtml = null;
let imageUrl = null;
let activeView = null; // the element shown when source is hidden: the iframe or the image view
let sandboxReady = false;
let pendingRender = false;

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow) return;
  if (event.data?.type === "sandbox-ready") {
    sandboxReady = true;
    if (pendingRender) postToSandbox();
  } else if (event.data?.type === "dhv-open-github" && github) {
    openGithubRawUrl(event.data.href);
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
  if (converted && github) throw new Error("Chrome cannot display this image format.");
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

// ---- GitHub ----

function githubFile(path) {
  const match = path.match(/^([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (!match) return null;
  const [, owner, repo, rest] = match;
  const repoRawPrefix = `https://github.com/${owner}/${repo}/raw/`;
  return {
    owner,
    repo,
    name: decodeURIComponent(rest.split("/").pop()),
    // github.com/<owner>/<repo>/raw/... works for public and (signed-in) private repos.
    rawUrl: new URL(`${repoRawPrefix}${rest}`).href,
    blobUrl: `https://github.com/${path}`,
    repoRawPrefix
  };
}

async function fetchRepoFile(url) {
  let response;
  try {
    response = await fetch(url, { credentials: "include", redirect: "follow" });
  } catch (error) {
    throw new Error(`Network error: ${error.message}`);
  }
  if (/github\.com\/login/.test(response.url)) {
    throw new Error("GitHub asked for sign-in. Sign in to github.com in this browser with an account that can see the repository, then reload.");
  }
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "GitHub returned 404: the file does not exist, or it is in a private repository this browser's GitHub account cannot see (sign in to github.com and reload)."
        : `GitHub returned HTTP ${response.status}.`
    );
  }
  return response;
}

async function fetchGithubFile() {
  const response = await fetchRepoFile(github.rawUrl);
  // Public repos redirect to raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>, which serves files
  // to anyone (with CORS), so the page's own relative references can load from there.
  // Private repos redirect to a raw URL with a per-file token, so their assets must be inlined.
  const finalUrl = new URL(response.url);
  github.private = finalUrl.searchParams.has("token") || finalUrl.hostname !== "raw.githubusercontent.com";
  if (!github.private) {
    finalUrl.search = "";
    github.pageUrl = finalUrl.href;
    github.pagePrefix = `https://raw.githubusercontent.com/${github.owner}/${github.repo}/`;
  } else {
    github.pageUrl = github.rawUrl;
    github.pagePrefix = github.repoRawPrefix;
  }
  return { name: github.name, buffer: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "" };
}

// Opens another HTML file of the same repository (a link clicked inside the rendered page) in this tab.
function openGithubRawUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  if (!url.href.startsWith(github.pagePrefix)) return;
  const path = githubPathOf(url);
  if (!path) return;
  const next = new URLSearchParams({ gh: path });
  location.assign(`${location.pathname}?${next}${url.hash}`);
}

const isRelativeRef = (value) => Boolean(value) && !/^\s*(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(value);

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Absolute URLs for relative url(...) references inside a stylesheet.
function rebaseCss(css, cssUrl) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, quote, ref) =>
    isRelativeRef(ref) && !ref.startsWith("data:") ? `url(${quote}${new URL(ref, cssUrl).href}${quote})` : whole
  );
}

// raw.githubusercontent.com serves CSS and JS as text/plain (with nosniff), which browsers refuse to apply,
// so the page's relative stylesheets and scripts are inlined as text. Private repos also get their images
// inlined as data: URLs. Everything else relative resolves through <base>.
async function resolveGithubAssets(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const resolve = (ref) => new URL(ref, github.rawUrl).href;
  const failed = [];
  let inlined = 0;

  const jobs = [];
  for (const link of doc.querySelectorAll('link[rel~="stylesheet" i][href]')) {
    const ref = link.getAttribute("href");
    if (!isRelativeRef(ref)) continue;
    jobs.push(
      fetchRepoFile(resolve(ref))
        .then((r) => r.text())
        .then((css) => {
          const style = doc.createElement("style");
          if (link.media) style.media = link.media;
          style.textContent = rebaseCss(css, new URL(ref, github.pageUrl).href).replace(/<\/style/gi, "<\\/style");
          link.replaceWith(style);
          inlined += 1;
        })
        .catch(() => failed.push(ref))
    );
  }
  for (const script of doc.querySelectorAll("script[src]")) {
    const ref = script.getAttribute("src");
    if (!isRelativeRef(ref)) continue;
    jobs.push(
      fetchRepoFile(resolve(ref))
        .then((r) => r.text())
        .then((code) => {
          script.removeAttribute("src");
          script.textContent = code.replace(/<\/script/gi, "<\\/script");
          inlined += 1;
        })
        .catch(() => failed.push(ref))
    );
  }
  // Public repos: images load from raw.githubusercontent.com through <base>, keeping the page's src values intact.
  for (const image of github.private ? doc.querySelectorAll("img[src], input[type=image][src]") : []) {
    const ref = image.getAttribute("src");
    if (!isRelativeRef(ref)) continue;
    jobs.push(
      fetchRepoFile(resolve(ref))
        .then((r) => r.blob())
        .then(blobToDataUrl)
        .then((dataUrl) => {
          image.setAttribute("src", dataUrl);
          inlined += 1;
        })
        .catch(() => failed.push(ref))
    );
  }
  for (const style of doc.querySelectorAll("style")) {
    style.textContent = rebaseCss(style.textContent, github.pageUrl);
  }
  await Promise.all(jobs);

  const head = doc.head;
  const base = doc.createElement("base");
  // The file's own URL (not its folder), so that "#anchor" links point at this document.
  base.href = github.pageUrl;
  // Keeps in-page anchors in this document, and opens links to other HTML files of the repo in the viewer.
  const navigation = doc.createElement("script");
  navigation.textContent = `(() => {
  const FILE = ${JSON.stringify(github.pageUrl)};
  const REPO = ${JSON.stringify(github.pagePrefix)};
  document.addEventListener("click", (event) => {
    const link = event.target.closest && event.target.closest("a[href]");
    if (!link || event.defaultPrevented || event.button !== 0 || link.target === "_blank") return;
    const url = new URL(link.href);
    if (url.href.split("#")[0] === FILE) {
      event.preventDefault();
      const id = decodeURIComponent(url.hash.slice(1));
      const target = id && (document.getElementById(id) || document.getElementsByName(id)[0]);
      if (target) target.scrollIntoView();
      else if (!id) scrollTo(0, 0);
    } else if (url.href.startsWith(REPO) && /\\.html?$/i.test(url.pathname)) {
      event.preventDefault();
      parent.postMessage({ type: "dhv-open-github", href: url.href }, "*");
    }
  });
})();`;
  head.prepend(base, navigation);

  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : "";
  return { html: doctype + doc.documentElement.outerHTML, inlined, failed };
}

async function load() {
  $("error").hidden = true;
  setStatus("Loading…");
  try {
    const { name, buffer, contentType } = github ? await fetchGithubFile() : await fetchDriveFile(fileId);
    $("file-name").textContent = name;
    $("reload").hidden = false;
    const imageType = imageTypeOf(name, buffer, contentType);
    if (imageType) {
      document.title = name;
      await showImage(name, buffer, imageType);
      return;
    }
    const html = decode(buffer, contentType);
    const title = new DOMParser().parseFromString(html, "text/html").title.trim();
    document.title = title ? `${title} — ${name}` : name;
    const notes = [];
    if (!/\.html?$/i.test(name)) notes.push("not an .html file — rendering anyway");
    if (github) {
      setStatus("Loading the page's files from the repository…");
      const resolved = await resolveGithubAssets(html);
      currentHtml = resolved.html;
      if (resolved.inlined) notes.push(`${resolved.inlined} linked file${resolved.inlined === 1 ? "" : "s"} loaded from the repo`);
      if (resolved.failed.length) notes.push(`not found: ${resolved.failed.join(", ")}`);
    } else {
      currentHtml = html;
    }
    setStatus(notes.join(" · "));
    // "View source" always shows the file exactly as stored, not the version with inlined assets.
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

// GitHub file page (github.com/o/r/blob/...), raw link (github.com/o/r/raw/..., raw.githubusercontent.com/o/r/...).
function githubPathOf(url) {
  if (url.hostname === "github.com") {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
    return match ? `${match[1]}/${match[2]}/blob/${match[3]}` : null;
  }
  if (url.hostname === "raw.githubusercontent.com") {
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(.+)$/);
    return match ? `${match[1]}/${match[2]}/blob/${match[3].replace(/^refs\/heads\//, "")}` : null;
  }
  return null;
}

function parseInput(value) {
  const trimmed = value.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return { id: trimmed, authuser: null };
  try {
    const url = new URL(trimmed);
    const gh = githubPathOf(url);
    if (gh) return { github: gh };
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
    $("picker-input").setCustomValidity("Not a recognizable Drive link, file ID or GitHub file link");
    $("picker-input").reportValidity();
    return;
  }
  const next = target.github ? new URLSearchParams({ gh: target.github }) : new URLSearchParams({ id: target.id });
  if (target.authuser !== null && target.authuser !== undefined) next.set("authuser", target.authuser);
  location.search = next.toString();
});
$("picker-input").addEventListener("input", () => $("picker-input").setCustomValidity(""));

if (github) {
  const origin = $("open-drive");
  origin.textContent = "Open on GitHub";
  origin.title = "GitHub's file page: code view, blame and history";
  origin.href = github.blobUrl;
  origin.hidden = false;
  load();
} else if (githubPath) {
  showError("Not a recognizable GitHub file path.");
} else if (fileId) {
  const drive = $("open-drive");
  drive.href = `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view${authuser !== null ? `?authuser=${encodeURIComponent(authuser)}` : ""}`;
  drive.hidden = false;
  load();
} else {
  $("picker").hidden = false;
}
