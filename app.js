const params = new URLSearchParams(window.location.search);
const host = params.get("host") || "127.0.0.1";
const port = params.get("port") || "2946";
const storageKey = "bs-stream-overlay-settings-v1";
const isOverlayMode = params.get("overlay") === "1";

const defaultSettings = {
  position: "top-left",
  visible: {
    cover: true,
    title: true,
    artist: true,
    mapper: true,
    difficulty: true,
    bpm: true,
    njs: true,
    time: true,
    score: true,
    combo: true,
    rank: true,
    accuracy: true,
    misses: true,
    health: true,
  },
};
const positionKeys = ["top-left", "top-right", "bottom-left", "bottom-right"];
const visibleKeys = Object.keys(defaultSettings.visible);

const state = {
  map: null,
  live: null,
  settings: loadSettings(),
  sockets: [],
  reconnectTimer: null,
  openSockets: 0,
  intentionalClosures: new WeakSet(),
};

const $ = (id) => document.getElementById(id);
const ui = {
  preview: $("overlay-preview"),
  copyOverlayUrl: $("copy-overlay-url"),
  loadSettingsButton: $("load-settings"),
  loadSettingsDialog: $("load-settings-dialog"),
  loadSettingsForm: $("load-settings-form"),
  loadSettingsUrl: $("load-settings-url"),
  loadSettingsError: $("load-settings-error"),
  cancelLoadSettings: $("cancel-load-settings"),
  connectionDot: $("connection-dot"),
  connectionLabel: $("connection-label"),
  connectionDetail: $("connection-detail"),
  coverArt: $("cover-art"),
  coverFallback: $("cover-fallback"),
  coverTime: $("cover-time"),
  coverProgress: $("cover-progress"),
  songTitle: $("song-title"),
  songSubtitle: $("song-subtitle"),
  songArtist: $("song-artist"),
  songMapper: $("song-mapper"),
  difficulty: $("difficulty"),
  bpm: $("bpm"),
  njs: $("njs"),
  score: $("score"),
  combo: $("combo"),
  rank: $("rank"),
  accuracy: $("accuracy"),
  misses: $("misses"),
  health: $("health"),
  healthMeter: $("health-meter"),
  healthFill: $("health-fill"),
};

function loadSettings() {
  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch {}

  const settings = {
    position: saved?.position || defaultSettings.position,
    visible: { ...defaultSettings.visible, ...(saved?.visible || {}) },
  };

  const urlPosition = params.get("position");
  if (positionKeys.includes(urlPosition)) settings.position = urlPosition;

  const urlVisible = params.get("show");
  if (urlVisible !== null) {
    const shown = new Set(urlVisible.split(",").filter((key) => visibleKeys.includes(key)));
    settings.visible = Object.fromEntries(visibleKeys.map((key) => [key, shown.has(key)]));
  }

  return settings;
}

function applySettingsToUrl(url) {
  url.searchParams.set("position", state.settings.position);
  url.searchParams.set("show", visibleKeys.filter((key) => state.settings.visible[key] !== false).join(","));
  url.searchParams.delete("demo");
  return url;
}

function syncEditorUrl() {
  if (isOverlayMode) return;
  const url = applySettingsToUrl(new URL(window.location.href));
  url.searchParams.delete("overlay");
  window.history.replaceState(null, "", url);
}

function buildOverlayUrl() {
  const url = applySettingsToUrl(new URL(window.location.href));
  url.searchParams.set("overlay", "1");
  return url.toString();
}

function saveSettings() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.settings));
  } catch {}

  syncEditorUrl();
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value) || 0);
}

function formatTime(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function normalizeCover(value) {
  if (!value) return "";
  if (/^(data:|https?:|blob:)/i.test(value)) return value;
  return `data:image/png;base64,${value}`;
}

function normalizeHealth(value) {
  const health = Number(value) || 0;
  return health <= 1 ? health * 100 : health;
}

let marqueeFrame = null;

function updateMarquees() {
  cancelAnimationFrame(marqueeFrame);
  marqueeFrame = requestAnimationFrame(() => {
    document.querySelectorAll("[data-marquee]").forEach((element) => {
      element.classList.remove("is-overflowing");
      element.style.removeProperty("--marquee-distance");
      element.style.removeProperty("--marquee-duration");

      const viewportWidth = element.parentElement.clientWidth;
      if (!viewportWidth) return;

      const distance = Math.ceil(element.scrollWidth - viewportWidth);
      if (distance <= 2) return;

      element.style.setProperty("--marquee-distance", `${distance}px`);
      element.style.setProperty("--marquee-duration", `${Math.max(7, distance / 28 + 5).toFixed(2)}s`);
      element.classList.add("is-overflowing");
    });
  });
}

function renderSettings() {
  ui.preview.dataset.position = state.settings.position;
  ui.preview.classList.toggle("without-cover", state.settings.visible.cover === false);

  document.querySelectorAll(".position-grid button[data-position]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.position === state.settings.position));
  });

  document.querySelectorAll("[data-toggle]").forEach((input) => {
    input.checked = state.settings.visible[input.dataset.toggle] !== false;
  });

  document.querySelectorAll("[data-preview]").forEach((element) => {
    element.classList.toggle("is-hidden", state.settings.visible[element.dataset.preview] === false);
  });

  updateMarquees();
}

function renderMap() {
  const map = state.map;
  if (!map) return;

  const levelEnded = Boolean(map.LevelFinished || map.LevelFailed || map.LevelQuit);
  ui.preview.classList.toggle("is-ended", levelEnded);
  ui.preview.setAttribute("aria-hidden", String(levelEnded));

  const cover = normalizeCover(map.CoverImage);
  ui.songTitle.textContent = map.SongName || "Waiting for a song";
  ui.songSubtitle.textContent = map.SongSubName || "";
  ui.songArtist.textContent = map.SongAuthor || "No song data";
  ui.songMapper.textContent = map.Mapper || map.Mappers?.join(", ") || "";
  ui.difficulty.textContent = map.CustomDifficultyLabel ||
    (map.Difficulty === "ExpertPlus" ? "Expert +" : map.Difficulty) || "—";
  ui.bpm.textContent = formatNumber(map.BPM);
  ui.njs.textContent = formatNumber(map.NJS, 1);
  updateMarquees();

  if (cover) {
    ui.coverArt.src = cover;
    ui.coverArt.parentElement.classList.add("has-image");
  } else {
    ui.coverArt.removeAttribute("src");
    ui.coverArt.parentElement.classList.remove("has-image");
  }

  renderLive();
}

function renderLive() {
  const live = state.live;
  if (!live) return;

  const elapsed = Number(live.TimeElapsed) || 0;
  const duration = Number(state.map?.Duration) || 0;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;
  ui.coverTime.textContent = formatTime(elapsed);
  ui.coverProgress.style.strokeDashoffset = String(289 * (1 - progress));
  ui.score.textContent = formatNumber(live.Score);
  ui.combo.textContent = formatNumber(live.Combo);
  ui.rank.textContent = live.Rank || "—";
  ui.accuracy.textContent = Number(live.Accuracy || 0).toFixed(2);
  ui.misses.textContent = formatNumber(live.Misses);
  const health = Math.max(0, Math.min(100, normalizeHealth(live.PlayerHealth)));
  ui.health.textContent = formatNumber(health);
  ui.healthFill.style.width = `${health}%`;
  ui.healthMeter.dataset.level = health <= 25 ? "low" : health < 70 ? "medium" : "high";
}

function setConnection(status, label) {
  ui.connectionDot.dataset.state = status;
  ui.connectionLabel.textContent = label;
  ui.connectionDetail.textContent = `${host}:${port}`;
}

function closeSockets() {
  state.sockets.forEach((socket) => {
    state.intentionalClosures.add(socket);
    socket.close();
  });
  state.sockets = [];
  state.openSockets = 0;
}

function connectEndpoint(path, handler) {
  const socket = new WebSocket(`ws://${host}:${port}${path}`);
  state.sockets.push(socket);

  socket.addEventListener("open", () => {
    state.openSockets += 1;
    if (state.openSockets === 2) setConnection("live", "DataPuller connected");
  });

  socket.addEventListener("message", ({ data }) => {
    try {
      handler(JSON.parse(data));
    } catch (error) {
      console.warn("Ignored invalid DataPuller message", error);
    }
  });

  socket.addEventListener("close", () => {
    if (state.intentionalClosures.has(socket)) return;
    state.openSockets = Math.max(0, state.openSockets - 1);
    setConnection("offline", "DataPuller disconnected");
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = setTimeout(connectDataPuller, 2500);
  });

  socket.addEventListener("error", () => socket.close());
}

function connectDataPuller() {
  closeSockets();
  setConnection("connecting", "Connecting to DataPuller");

  if (window.location.protocol === "https:") {
    setConnection("offline", "Local WebSocket blocked by HTTPS");
    return;
  }

  connectEndpoint("/BSDataPuller/MapData", (map) => {
    state.map = map;
    renderMap();
  });
  connectEndpoint("/BSDataPuller/LiveData", (live) => {
    state.live = live;
    renderLive();
  });
}

document.querySelectorAll(".position-grid button[data-position]").forEach((button) => {
  button.addEventListener("click", () => {
    state.settings.position = button.dataset.position;
    saveSettings();
    renderSettings();
  });
});

document.querySelectorAll("[data-toggle]").forEach((input) => {
  input.addEventListener("change", () => {
    state.settings.visible[input.dataset.toggle] = input.checked;
    saveSettings();
    renderSettings();
  });
});

$("reset-settings").addEventListener("click", () => {
  state.settings = structuredClone(defaultSettings);
  saveSettings();
  renderSettings();
});

ui.copyOverlayUrl.addEventListener("click", async () => {
  const overlayUrl = buildOverlayUrl();

  try {
    await navigator.clipboard.writeText(overlayUrl);
  } catch {
    const input = document.createElement("textarea");
    input.value = overlayUrl;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  ui.copyOverlayUrl.textContent = "Copied!";
  clearTimeout(ui.copyOverlayUrl.copyResetTimer);
  ui.copyOverlayUrl.copyResetTimer = setTimeout(() => {
    ui.copyOverlayUrl.textContent = "Copy overlay URL";
  }, 2500);
});

ui.loadSettingsButton.addEventListener("click", () => {
  ui.loadSettingsUrl.value = "";
  ui.loadSettingsError.textContent = "";
  ui.loadSettingsDialog.showModal();
  ui.loadSettingsUrl.focus();
});

ui.cancelLoadSettings.addEventListener("click", () => {
  ui.loadSettingsDialog.close();
});

ui.loadSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();

  try {
    const loadedUrl = new URL(ui.loadSettingsUrl.value.trim(), window.location.href);
    const loadedPosition = loadedUrl.searchParams.get("position");
    const loadedVisible = loadedUrl.searchParams.get("show");

    if (loadedPosition !== null && !positionKeys.includes(loadedPosition)) {
      throw new Error("That URL contains an unsupported overlay position.");
    }

    if (loadedPosition === null && loadedVisible === null) {
      throw new Error("That URL does not contain overlay settings.");
    }

    const nextSettings = structuredClone(state.settings);
    if (loadedPosition !== null) nextSettings.position = loadedPosition;

    if (loadedVisible !== null) {
      const shown = new Set(loadedVisible.split(",").filter((key) => visibleKeys.includes(key)));
      nextSettings.visible = Object.fromEntries(visibleKeys.map((key) => [key, shown.has(key)]));
    }

    state.settings = nextSettings;
    saveSettings();
    renderSettings();
    ui.loadSettingsDialog.close();
  } catch (error) {
    ui.loadSettingsError.textContent = error.message || "Enter a valid overlay URL.";
  }
});

ui.coverArt.addEventListener("error", () => {
  ui.coverArt.parentElement.classList.remove("has-image");
});

window.addEventListener("resize", updateMarquees);
document.fonts?.ready.then(updateMarquees);

document.documentElement.classList.toggle("overlay-mode", isOverlayMode);
document.body.classList.toggle("overlay-mode", isOverlayMode);
renderSettings();
if (!isOverlayMode) saveSettings();
connectDataPuller();
