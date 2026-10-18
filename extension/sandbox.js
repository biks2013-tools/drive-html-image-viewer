// Runs in a sandboxed, opaque-origin page: it has no extension APIs and no access
// to Google cookies, so scripts inside the rendered file are isolated.

// An opaque origin has no storage: localStorage, sessionStorage and document.cookie throw.
// Pages commonly use them, so give them in-memory versions that last as long as the rendering.
function memoryStorage() {
  const items = new Map();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => (items.has(String(key)) ? items.get(String(key)) : null),
    setItem: (key, value) => void items.set(String(key), String(value)),
    removeItem: (key) => void items.delete(String(key)),
    clear: () => items.clear()
  };
}

for (const name of ["localStorage", "sessionStorage"]) {
  try {
    void window[name].length;
  } catch {
    Object.defineProperty(window, name, { value: memoryStorage(), configurable: true });
  }
}

try {
  void document.cookie;
} catch {
  const cookies = new Map();
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
    set: (text) => {
      const [pair] = String(text).split(";");
      const at = pair.indexOf("=");
      if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  });
}

window.addEventListener("message", function onMessage(event) {
  if (event.source !== window.parent || typeof event.data?.html !== "string") return;
  window.removeEventListener("message", onMessage);
  document.open();
  document.write(event.data.html);
  document.close();
});
window.parent.postMessage({ type: "sandbox-ready" }, "*");
