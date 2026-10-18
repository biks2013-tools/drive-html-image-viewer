// Runs in a sandboxed, opaque-origin page: it has no extension APIs and no access
// to Google cookies, so scripts inside the rendered file are isolated.
window.addEventListener("message", function onMessage(event) {
  if (event.source !== window.parent || typeof event.data?.html !== "string") return;
  window.removeEventListener("message", onMessage);
  document.open();
  document.write(event.data.html);
  document.close();
});
window.parent.postMessage({ type: "sandbox-ready" }, "*");
