const themeStorageKey = "bs-stream-overlay-theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const themeChoices = new Set(["system", "light", "dark"]);

function readThemeChoice() {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    return themeChoices.has(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

let themeChoice = readThemeChoice();

function applyTheme() {
  const resolved = themeChoice === "system" ? (systemTheme.matches ? "dark" : "light") : themeChoice;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]').content = resolved === "dark" ? "#1b1b1b" : "#c2c2c2";
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === themeChoice));
  });
}

applyTheme();
systemTheme.addEventListener("change", () => {
  if (themeChoice === "system") applyTheme();
});

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      themeChoice = button.dataset.themeChoice;
      try {
        localStorage.setItem(themeStorageKey, themeChoice);
      } catch { }
      applyTheme();
    });
  });
  applyTheme();
});
