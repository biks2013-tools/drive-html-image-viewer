const mark = (id, text, ok = true) => {
  const element = document.getElementById(id);
  element.textContent = text;
  element.className = ok ? "ok" : "fail";
};

mark("script-check", "ran ✓");

fetch("data/info.json")
  .then((response) => response.json())
  .then((info) => mark("fetch-check", `loaded ✓ (${info.message})`))
  .catch((error) => mark("fetch-check", `failed: ${error.message}`, false));

try {
  const visits = Number(localStorage.getItem("visits") ?? 0) + 1;
  localStorage.setItem("visits", String(visits));
  mark("storage-check", `works ✓ (visit ${visits})`);
} catch (error) {
  mark("storage-check", `failed: ${error.message}`, false);
}

const logo = document.getElementById("logo");
const imageLoaded = () => mark("image-check", `loaded ✓ (${logo.naturalWidth}×${logo.naturalHeight})`);
if (logo.complete && logo.naturalWidth) imageLoaded();
else {
  logo.addEventListener("load", imageLoaded);
  logo.addEventListener("error", () => mark("image-check", "failed", false));
}

let clicks = 0;
document.getElementById("counter").addEventListener("click", (event) => {
  clicks += 1;
  event.target.textContent = `Clicked ${clicks} time${clicks === 1 ? "" : "s"}`;
});
