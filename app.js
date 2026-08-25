const params = new URLSearchParams(window.location.search);
const host = params.get("host") || "127.0.0.1";
const customPort = params.get("port");
const heartRateHost = params.get("hrhost") || (params.has("host") ? host : "localhost");
const storageKey = "bs-stream-overlay-settings-v1";
const isOverlayMode = params.get("overlay") === "1";
const referenceCanvas = { width: 1920, height: 1080 };
const dataSourceValues = ["datapuller", "bsplus"];

const defaultSettings = {
  dataSource: "datapuller",
  position: "top-left",
  fontFamily: "",
  fontWeight: 0,
  fontScale: 100,
  textTransform: "",
  accentColor: "#f000dc",
  overlayScale: 100,
  shadow: {
    enabled: true,
    strength: 100,
  },
  heartRate: {
    enabled: false,
    mode: "paired",
    position: "top-right",
    port: 65302,
  },
  visible: {
    cover: true,
    title: true,
    artist: true,
    mapper: true,
    difficulty: true,
    bpm: true,
    njs: true,
    bsr: true,
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
const fontWeightValues = [0, 400, 500, 600, 700, 800, 900];
const textTransformValues = ["", "uppercase", "lowercase", "capitalize"];
const heartRateModeValues = ["paired", "standalone"];
const unavailableFieldsByDataSource = {
  bsplus: new Set(["njs", "bsr"]),
};

const state = {
  map: null,
  live: null,
  settings: loadSettings(),
  sockets: [],
  reconnectTimer: null,
  openSockets: 0,
  intentionalClosures: new WeakSet(),
  heartRate: null,
  heartRateTimer: null,
  heartRatePollingSignature: "",
  fonts: [],
  fontsLoaded: false,
  fontsLoading: null,
  activeFontIndex: -1,
  beatSaberPlusClock: null,
  telemetryClockTimer: null,
  connectionGeneration: 0,
  availableDataSources: [],
};

const $ = (id) => document.getElementById(id);
const ui = {
  preview: $("overlay-preview"),
  overlayShadow: $("overlay-shadow"),
  copyOverlayUrl: $("copy-overlay-url"),
  copyOverlayUrlText: $("copy-overlay-url-text"),
  copyOverlayUrlLabel: $("copy-overlay-url-label"),
  loadSettingsButton: $("load-settings"),
  loadSettingsDialog: $("load-settings-dialog"),
  loadSettingsForm: $("load-settings-form"),
  loadSettingsUrl: $("load-settings-url"),
  loadSettingsError: $("load-settings-error"),
  cancelLoadSettings: $("cancel-load-settings"),
  connectionDot: $("connection-dot"),
  connectionLabel: $("connection-label"),
  connectionDetail: $("connection-detail"),
  dataSourceControl: $("data-source-control"),
  dataSource: $("data-source"),
  connectionAdvice: $("connection-advice"),
  fontPicker: $("font-picker"),
  fontSearch: $("font-search"),
  fontOptions: $("font-options"),
  fontStatus: $("font-status"),
  fontWeight: $("font-weight"),
  fontSize: $("font-size"),
  fontSizeValue: $("font-size-value"),
  textTransform: $("text-transform"),
  accentColor: $("accent-color"),
  overlayScale: $("overlay-scale"),
  overlayScaleValue: $("overlay-scale-value"),
  shadowEnabled: $("shadow-enabled"),
  shadowOptions: $("shadow-options"),
  shadowStrength: $("shadow-strength"),
  shadowStrengthValue: $("shadow-strength-value"),
  heartRateEnabled: $("heart-rate-enabled"),
  heartRateOptions: $("heart-rate-options"),
  heartRateModeButtons: document.querySelectorAll("[data-heart-rate-mode]"),
  heartRatePositionSettings: $("heart-rate-position-settings"),
  heartRatePort: $("heart-rate-port"),
  heartRateDot: $("heart-rate-dot"),
  heartRateStatus: $("heart-rate-status"),
  heartRatePaired: $("heart-rate-paired"),
  heartRatePairedValue: $("heart-rate-paired-value"),
  heartRateStandalone: $("heart-rate-standalone"),
  heartRateStandaloneValue: $("heart-rate-standalone-value"),
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
  bsrCodeWrap: $("bsr-code-wrap"),
  score: $("score"),
  combo: $("combo"),
  rank: $("rank"),
  accuracy: $("accuracy"),
  misses: $("misses"),
  health: $("health"),
  healthFill: $("health-fill"),
};

function loadSettings() {
  let saved = null;

  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch { }

  const settings = {
    dataSource: normalizeDataSource(saved?.dataSource),
    position: saved?.position || defaultSettings.position,
    fontFamily: normalizeFontFamily(saved?.fontFamily),
    fontWeight: normalizeFontWeight(saved?.fontWeight),
    fontScale: normalizeFontScale(saved?.fontScale),
    textTransform: normalizeTextTransform(saved?.textTransform),
    accentColor: normalizeAccentColor(saved?.accentColor),
    overlayScale: normalizeOverlayScale(saved?.overlayScale),
    shadow: {
      enabled: saved?.shadow?.enabled !== false,
      strength: normalizeShadowStrength(saved?.shadow?.strength),
    },
    heartRate: {
      enabled: saved?.heartRate?.enabled === true,
      mode: normalizeHeartRateMode(saved?.heartRate?.mode),
      position: normalizePosition(saved?.heartRate?.position, defaultSettings.heartRate.position),
      port: normalizePort(saved?.heartRate?.port),
    },
    visible: { ...defaultSettings.visible, ...(saved?.visible || {}) },
  };

  const urlPosition = params.get("position");
  if (positionKeys.includes(urlPosition)) settings.position = urlPosition;

  const urlDataSource = params.get("source");
  if (urlDataSource !== null) settings.dataSource = normalizeDataSource(urlDataSource);
  else if (isOverlayMode) settings.dataSource = defaultSettings.dataSource;

  const urlVisible = params.get("show");
  if (urlVisible !== null) {
    const shown = new Set(urlVisible.split(",").filter((key) => visibleKeys.includes(key)));
    settings.visible = Object.fromEntries(visibleKeys.map((key) => [key, shown.has(key)]));
  }

  const urlFont = params.get("font");
  if (urlFont !== null) settings.fontFamily = normalizeFontFamily(urlFont);

  const urlWeight = params.get("weight");
  if (urlWeight !== null) settings.fontWeight = normalizeFontWeight(urlWeight);

  const urlScale = params.get("scale");
  if (urlScale !== null) settings.fontScale = normalizeFontScale(urlScale);

  const urlTextTransform = params.get("case");
  if (urlTextTransform !== null) settings.textTransform = normalizeTextTransform(urlTextTransform);

  const urlAccentColor = params.get("accent");
  if (urlAccentColor !== null) settings.accentColor = normalizeAccentColor(urlAccentColor);

  const urlOverlayScale = params.get("overlayscale");
  if (urlOverlayScale !== null) settings.overlayScale = normalizeOverlayScale(urlOverlayScale);

  const urlShadowEnabled = params.get("shadow");
  if (urlShadowEnabled !== null) settings.shadow.enabled = urlShadowEnabled !== "0";

  const urlShadowStrength = params.get("shadowstrength");
  if (urlShadowStrength !== null) settings.shadow.strength = normalizeShadowStrength(urlShadowStrength);

  const urlHeartRateMode = params.get("hr");
  if (urlHeartRateMode !== null) {
    settings.heartRate.enabled = heartRateModeValues.includes(urlHeartRateMode);
    settings.heartRate.mode = normalizeHeartRateMode(urlHeartRateMode);
  }

  const urlHeartRatePosition = params.get("hrposition");
  if (urlHeartRatePosition !== null) {
    settings.heartRate.position = normalizePosition(urlHeartRatePosition, settings.heartRate.position);
  }

  const urlHeartRatePort = params.get("hrport");
  if (urlHeartRatePort !== null) settings.heartRate.port = normalizePort(urlHeartRatePort);

  return settings;
}

function normalizeFontFamily(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
}

function normalizeDataSource(value) {
  return dataSourceValues.includes(value) ? value : defaultSettings.dataSource;
}

function normalizeFontWeight(value) {
  const weight = Number(value);
  return fontWeightValues.includes(weight) ? weight : defaultSettings.fontWeight;
}

function normalizeFontScale(value) {
  const scale = Math.round(Number(value) / 5) * 5;
  return Number.isFinite(scale) ? Math.max(75, Math.min(150, scale)) : defaultSettings.fontScale;
}

function normalizeTextTransform(value) {
  return textTransformValues.includes(value) ? value : defaultSettings.textTransform;
}

function normalizeAccentColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value.toLowerCase() : defaultSettings.accentColor;
}

function normalizeOverlayScale(value) {
  const scale = Math.round(Number(value) / 5) * 5;
  return Number.isFinite(scale) ? Math.max(50, Math.min(200, scale)) : defaultSettings.overlayScale;
}

function normalizeShadowStrength(value) {
  const strength = Math.round(Number(value) / 5) * 5;
  return Number.isFinite(strength)
    ? Math.max(10, Math.min(100, strength))
    : defaultSettings.shadow.strength;
}

function getRelativeLuminance(color) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function getContrastRatio(firstLuminance, secondLuminance) {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getAccentTextColor(accentColor) {
  const accentLuminance = getRelativeLuminance(accentColor);
  const darkText = "#181719";
  const lightText = "#ffffff";
  return getContrastRatio(accentLuminance, getRelativeLuminance(darkText)) >
    getContrastRatio(accentLuminance, getRelativeLuminance(lightText))
    ? darkText
    : lightText;
}

function normalizeHeartRateMode(value) {
  return heartRateModeValues.includes(value) ? value : defaultSettings.heartRate.mode;
}

function normalizePosition(value, fallback = defaultSettings.position) {
  return positionKeys.includes(value) ? value : fallback;
}

function normalizePort(value) {
  const portNumber = Math.round(Number(value));
  return Number.isFinite(portNumber) && portNumber >= 1 && portNumber <= 65535
    ? portNumber
    : defaultSettings.heartRate.port;
}

function applySettingsToUrl(url) {
  if (state.settings.dataSource !== defaultSettings.dataSource) {
    url.searchParams.set("source", state.settings.dataSource);
  } else url.searchParams.delete("source");
  url.searchParams.set("position", state.settings.position);
  url.searchParams.set("show", visibleKeys.filter((key) => state.settings.visible[key] !== false).join(","));
  if (state.settings.fontFamily) url.searchParams.set("font", state.settings.fontFamily);
  else url.searchParams.delete("font");
  if (state.settings.fontWeight) url.searchParams.set("weight", String(state.settings.fontWeight));
  else url.searchParams.delete("weight");
  if (state.settings.fontScale !== defaultSettings.fontScale) {
    url.searchParams.set("scale", String(state.settings.fontScale));
  } else url.searchParams.delete("scale");
  if (state.settings.textTransform) url.searchParams.set("case", state.settings.textTransform);
  else url.searchParams.delete("case");
  if (state.settings.accentColor !== defaultSettings.accentColor) {
    url.searchParams.set("accent", state.settings.accentColor);
  } else url.searchParams.delete("accent");
  if (state.settings.overlayScale !== defaultSettings.overlayScale) {
    url.searchParams.set("overlayscale", String(state.settings.overlayScale));
  } else url.searchParams.delete("overlayscale");
  if (state.settings.shadow.enabled) url.searchParams.delete("shadow");
  else url.searchParams.set("shadow", "0");
  if (state.settings.shadow.strength !== defaultSettings.shadow.strength) {
    url.searchParams.set("shadowstrength", String(state.settings.shadow.strength));
  } else url.searchParams.delete("shadowstrength");
  if (state.settings.heartRate.enabled) {
    url.searchParams.set("hr", state.settings.heartRate.mode);
    url.searchParams.set("hrport", String(state.settings.heartRate.port));
    if (state.settings.heartRate.mode === "standalone") {
      url.searchParams.set("hrposition", state.settings.heartRate.position);
    } else url.searchParams.delete("hrposition");
  } else {
    url.searchParams.delete("hr");
    url.searchParams.delete("hrposition");
    url.searchParams.delete("hrport");
  }
  url.searchParams.delete("demo");
  return url;
}

function buildOverlayUrl() {
  const url = applySettingsToUrl(new URL(window.location.href));
  url.searchParams.set("overlay", "1");
  return url.toString();
}

function saveSettings() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.settings));
  } catch { }
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

function getDataSourceName(source = state.settings.dataSource) {
  return source === "bsplus" ? "BS+ SO" : "DataPuller";
}

function setDataSourceChoiceVisible(visible) {
  ui.dataSourceControl.hidden = !visible;
  ui.connectionAdvice.hidden = !visible;
}

function getTelemetryPort(source = state.settings.dataSource) {
  return customPort || (source === "bsplus" ? "2947" : "2946");
}

function normalizeBeatSaberPlusDuration(value) {
  const duration = Math.max(0, Number(value) || 0);
  return duration / 1000;
}

function getRankFromAccuracy(value) {
  const accuracy = Math.max(0, Math.min(100, Number(value) || 0));
  if (accuracy >= 100) return "SSS";
  if (accuracy >= 90) return "SS";
  if (accuracy >= 80) return "S";
  if (accuracy >= 65) return "A";
  if (accuracy >= 50) return "B";
  if (accuracy >= 35) return "C";
  if (accuracy >= 20) return "D";
  return "E";
}

function adaptBeatSaberPlusMap(map) {
  return {
    InLevel: true,
    LevelPaused: false,
    LevelFinished: false,
    LevelFailed: false,
    LevelQuit: false,
    LevelID: map.level_id || "",
    SongName: map.name || "",
    SongSubName: map.sub_name || "",
    SongAuthor: map.artist || "",
    Mapper: map.mapper || "",
    Mappers: map.mapper ? [map.mapper] : [],
    BSRKey: map.BSRKey || "",
    CoverImage: map.coverRaw || "",
    Duration: normalizeBeatSaberPlusDuration(map.duration),
    MapType: map.characteristic || "",
    Difficulty: map.difficulty || "",
    BPM: Number(map.BPM) || 0,
    NJS: null,
    PP: Number(map.PP) || 0,
  };
}

function adaptBeatSaberPlusScore(score) {
  const accuracy = Math.max(0, Math.min(100, (Number(score.accuracy) || 0) * 100));
  return {
    Score: Number(score.score) || 0,
    Rank: getRankFromAccuracy(accuracy),
    Combo: Number(score.combo) || 0,
    Misses: Number(score.missCount) || 0,
    Accuracy: accuracy,
    PlayerHealth: Math.max(0, Math.min(100, (Number(score.currentHealth) || 0) * 100)),
    TimeElapsed: Number(score.time) || 0,
  };
}

function setBeatSaberPlusClock(time, paused = false, multiplier = null) {
  state.beatSaberPlusClock = {
    time: Math.max(0, Number(time) || 0),
    updatedAt: performance.now(),
    paused,
    multiplier: Number(multiplier) > 0
      ? Number(multiplier)
      : state.beatSaberPlusClock?.multiplier || 1,
  };
}

function getBeatSaberPlusTime() {
  const clock = state.beatSaberPlusClock;
  if (!clock || clock.paused) return clock?.time || 0;
  return clock.time + ((performance.now() - clock.updatedAt) / 1000) * clock.multiplier;
}

function hasLoadedMap(map) {
  if (!map) return false;
  return Boolean(
    String(map.SongName || "").trim() ||
    Number(map.Duration) > 0 ||
    String(map.Difficulty || "").trim()
  );
}

function getHealthColor(health) {
  const stops = [
    { value: 0, color: [239, 61, 85] },
    { value: 50, color: [242, 202, 58] },
    { value: 100, color: [61, 226, 111] },
  ];
  const start = health <= 50 ? stops[0] : stops[1];
  const end = health <= 50 ? stops[1] : stops[2];
  const progress = (health - start.value) / (end.value - start.value);
  return start.color.map((channel, index) => Math.round(channel + (end.color[index] - channel) * progress));
}

function getHeartRateColor(bpm) {
  if (bpm <= 120) return [88, 232, 138];
  if (bpm >= 180) return [255, 72, 96];
  const progress = (bpm - 120) / 60;
  const start = bpm <= 150 ? [88, 232, 138] : [255, 211, 77];
  const end = bpm <= 150 ? [255, 211, 77] : [255, 72, 96];
  const localProgress = bpm <= 150 ? progress * 2 : (progress - 0.5) * 2;
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * localProgress));
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
  const unavailableFields = unavailableFieldsByDataSource[state.settings.dataSource] || new Set();
  ui.copyOverlayUrlText.textContent = buildOverlayUrl();
  ui.preview.dataset.position = state.settings.position;
  ui.preview.classList.toggle("without-cover", state.settings.visible.cover === false);
  ui.preview.style.setProperty(
    "--overlay-font-family",
    state.settings.fontFamily ? `${JSON.stringify(state.settings.fontFamily)}, var(--font)` : "var(--font)",
  );
  ui.preview.style.setProperty("--overlay-text-scale", String(state.settings.fontScale / 100));
  ui.preview.style.setProperty("--overlay-font-weight", String(state.settings.fontWeight || 400));
  ui.preview.style.setProperty("--overlay-text-transform", state.settings.textTransform || "none");
  ui.preview.style.setProperty("--overlay-accent", state.settings.accentColor);
  ui.preview.style.setProperty("--overlay-accent-text", getAccentTextColor(state.settings.accentColor));
  ui.preview.classList.toggle("has-custom-font-weight", Boolean(state.settings.fontWeight));
  ui.preview.classList.toggle("has-custom-text-transform", Boolean(state.settings.textTransform));
  ui.heartRateStandalone.style.setProperty(
    "--overlay-font-family",
    state.settings.fontFamily ? `${JSON.stringify(state.settings.fontFamily)}, var(--font)` : "var(--font)",
  );
  ui.heartRateStandalone.style.setProperty("--overlay-text-scale", String(state.settings.fontScale / 100));
  ui.heartRateStandalone.style.setProperty("--overlay-font-weight", String(state.settings.fontWeight || 400));
  ui.heartRateStandalone.style.setProperty("--overlay-text-transform", state.settings.textTransform || "none");
  ui.heartRateStandalone.classList.toggle("has-custom-font-weight", Boolean(state.settings.fontWeight));
  ui.heartRateStandalone.classList.toggle("has-custom-text-transform", Boolean(state.settings.textTransform));

  ui.dataSource.value = state.settings.dataSource;
  ui.fontWeight.value = String(state.settings.fontWeight);
  ui.fontSize.value = String(state.settings.fontScale);
  ui.fontSizeValue.value = `${state.settings.fontScale}%`;
  ui.textTransform.value = state.settings.textTransform;
  ui.accentColor.value = state.settings.accentColor;
  ui.overlayScale.value = String(state.settings.overlayScale);
  ui.overlayScaleValue.value = `${state.settings.overlayScale}%`;
  ui.shadowEnabled.checked = state.settings.shadow.enabled;
  ui.shadowOptions.hidden = !state.settings.shadow.enabled;
  ui.shadowStrength.value = String(state.settings.shadow.strength);
  ui.shadowStrengthValue.value = `${state.settings.shadow.strength}%`;
  ui.heartRateEnabled.checked = state.settings.heartRate.enabled;
  ui.heartRateOptions.hidden = !state.settings.heartRate.enabled;
  ui.heartRatePort.value = String(state.settings.heartRate.port);
  ui.heartRatePositionSettings.hidden = state.settings.heartRate.mode !== "standalone";
  ui.heartRateStandalone.dataset.position = state.settings.heartRate.position;

  document.querySelectorAll(".position-grid button[data-position]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.position === state.settings.position));
  });

  document.querySelectorAll("[data-heart-rate-position]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.heartRatePosition === state.settings.heartRate.position));
  });

  ui.heartRateModeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.heartRateMode === state.settings.heartRate.mode));
  });

  document.querySelectorAll("[data-toggle]").forEach((input) => {
    input.checked = state.settings.visible[input.dataset.toggle] !== false;
    input.closest(".toggle-row").hidden = unavailableFields.has(input.dataset.toggle);
  });

  document.querySelectorAll("[data-preview]").forEach((element) => {
    element.classList.toggle("is-hidden", state.settings.visible[element.dataset.preview] === false);
  });

  if (document.activeElement !== ui.fontSearch) {
    ui.fontSearch.value = getSelectedFontLabel();
  }

  renderHeartRate();
  renderShadow();
  syncHeartRatePolling();
  updateResolutionScale();
  updateMarquees();
}

function renderShadow() {
  const overlayHidden = ui.preview.classList.contains("is-awaiting-data") ||
    ui.preview.classList.contains("is-ended");
  ui.overlayShadow.dataset.position = state.settings.position;
  ui.overlayShadow.style.setProperty("--overlay-shadow-strength", String(state.settings.shadow.strength / 100));
  ui.overlayShadow.classList.toggle("is-hidden", !state.settings.shadow.enabled || overlayHidden);
}

function updateResolutionScale() {
  const canvasScale = isOverlayMode
    ? Math.min(window.innerWidth / referenceCanvas.width, window.innerHeight / referenceCanvas.height)
    : 1;
  const resolutionScale = canvasScale * (state.settings.overlayScale / 100);
  const safeScale = Math.max(0.01, resolutionScale);

  ui.preview.style.setProperty("--overlay-resolution-scale", String(safeScale));
  ui.heartRateStandalone.style.setProperty("--overlay-resolution-scale", String(safeScale));
  if (isOverlayMode) ui.preview.style.setProperty("--overlay-edge-inset", `${34 * canvasScale}px`);
  else ui.preview.style.removeProperty("--overlay-edge-inset");
  if (isOverlayMode) ui.heartRateStandalone.style.setProperty("--overlay-edge-inset", `${34 * canvasScale}px`);
  else ui.heartRateStandalone.style.removeProperty("--overlay-edge-inset");
}

function getSelectedFontLabel() {
  if (!state.settings.fontFamily) return "";
  return state.fonts.find(({ family }) => family === state.settings.fontFamily)?.label || state.settings.fontFamily;
}

function setFontPickerOpen(open) {
  ui.fontPicker.classList.toggle("is-open", open);
  ui.fontOptions.hidden = !open;
  ui.fontSearch.setAttribute("aria-expanded", String(open));
  if (!open) {
    state.activeFontIndex = -1;
    ui.fontSearch.removeAttribute("aria-activedescendant");
  }
}

function getFilteredFonts() {
  const query = normalizeFontFamily(ui.fontSearch.value);
  if (!query || query === getSelectedFontLabel()) return state.fonts;
  const normalizedQuery = query.toLocaleLowerCase();
  return state.fonts.filter(({ label }) => label.toLocaleLowerCase().includes(normalizedQuery));
}

function renderFontOptions() {
  const fonts = getFilteredFonts();
  ui.fontOptions.replaceChildren();
  state.activeFontIndex = Math.min(state.activeFontIndex, fonts.length - 1);

  fonts.forEach(({ family, label }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `font-option-${index}`;
    button.className = "font-option";
    button.role = "option";
    button.dataset.family = family;
    button.setAttribute("aria-selected", String(family === state.settings.fontFamily));
    button.classList.toggle("is-active", index === state.activeFontIndex);
    button.textContent = label;
    button.style.fontFamily = family ? `${JSON.stringify(family)}, var(--font)` : "var(--font)";
    button.addEventListener("click", () => selectFont(family));
    ui.fontOptions.append(button);
  });

  if (!fonts.length) {
    const empty = document.createElement("p");
    empty.className = "font-options__empty";
    empty.textContent = state.fontsLoading
      ? "Waiting for local font permission…"
      : state.fontsLoaded
        ? state.fonts.length
          ? "No installed fonts match that search."
          : "No local fonts were returned by the browser."
        : "Allow local font access to load installed fonts.";
    ui.fontOptions.append(empty);
  }

  setFontPickerOpen(true);
}

function selectFont(family) {
  state.settings.fontFamily = normalizeFontFamily(family);
  ui.fontSearch.value = getSelectedFontLabel();
  setFontPickerOpen(false);
  saveSettings();
  renderSettings();
}

async function loadLocalFonts() {
  if (state.fontsLoaded) return;
  if (state.fontsLoading) return state.fontsLoading;

  if (typeof window.queryLocalFonts !== "function") {
    ui.fontStatus.textContent = "This browser does not provide local font access.";
    renderFontOptions();
    return;
  }

  ui.fontStatus.textContent = "Loading installed fonts…";
  state.fontsLoading = window.queryLocalFonts()
    .then((fontData) => {
      const families = [...new Set(fontData.map(({ family }) => normalizeFontFamily(family)).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      state.fonts = families.map((family) => ({ family, label: family }));
      state.fontsLoaded = true;
      ui.fontStatus.textContent = families.length
        ? `${families.length.toLocaleString()} local fonts available.`
        : "No local fonts were returned by the browser.";
    })
    .catch((error) => {
      state.fontsLoaded = false;
      ui.fontStatus.textContent = error?.name === "NotAllowedError"
        ? "Local font access was not allowed. Click the search box to try again."
        : "Local font access failed. Click the search box to try again.";
    })
    .finally(() => {
      state.fontsLoading = null;
      if (!ui.fontOptions.hidden) renderFontOptions();
    });

  return state.fontsLoading;
}

function renderMap() {
  const map = state.map;
  if (!map) return;

  const awaitingData = !hasLoadedMap(map);
  const levelEnded = Boolean(map.LevelFinished || map.LevelFailed || map.LevelQuit);
  const hidden = levelEnded || (isOverlayMode && awaitingData);
  ui.preview.classList.toggle("is-awaiting-data", isOverlayMode && awaitingData);
  ui.preview.classList.toggle("is-ended", levelEnded);
  renderShadow();
  ui.preview.setAttribute("aria-hidden", String(hidden));

  const cover = normalizeCover(map.CoverImage);
  ui.songTitle.textContent = map.SongName || "Waiting for a song";
  ui.songSubtitle.textContent = map.SongSubName || "";
  ui.songArtist.textContent = map.SongAuthor || "No song data";
  ui.songMapper.textContent = map.Mapper || map.Mappers?.join(", ") || "";
  ui.difficulty.textContent = map.CustomDifficultyLabel ||
    (map.Difficulty === "ExpertPlus" ? "Expert +" : map.Difficulty) || "—";
  ui.bpm.textContent = formatNumber(map.BPM);
  const hasNjs = map.NJS != null;
  ui.njs.parentElement.hidden = !hasNjs;
  ui.njs.textContent = hasNjs ? formatNumber(map.NJS, 1) : "";
  const bsrKey = String(map.BSRKey || "").trim();
  ui.bsrCodeWrap.textContent = bsrKey ? `!bsr ${bsrKey}` : "";
  ui.bsrCodeWrap.hidden = !bsrKey;
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
  const [red, green, blue] = getHealthColor(health);
  ui.health.textContent = formatNumber(health);
  ui.healthFill.style.width = `${health}%`;
  ui.healthFill.style.setProperty("--health-color", `rgb(${red} ${green} ${blue})`);
  ui.healthFill.style.setProperty("--health-glow", `rgb(${red} ${green} ${blue} / 0.52)`);
}

function renderHeartRate() {
  const bpm = Number(state.heartRate) || 0;
  const enabled = state.settings.heartRate.enabled;
  const available = bpm > 0;
  const paired = enabled && state.settings.heartRate.mode === "paired";
  const standalone = enabled && state.settings.heartRate.mode === "standalone";
  const shouldShowValue = !isOverlayMode || available;
  const displayValue = available ? String(Math.round(bpm)) : "--";
  const [red, green, blue] = getHeartRateColor(available ? bpm : 120);
  const pulseDuration = available ? Math.max(0.35, Math.min(1.5, 60 / bpm)) : 1;

  ui.heartRatePaired.hidden = !(paired && shouldShowValue);
  ui.heartRateStandalone.hidden = !(standalone && shouldShowValue);
  ui.preview.classList.toggle("has-paired-heart-rate", paired && shouldShowValue);
  ui.heartRatePairedValue.textContent = displayValue;
  ui.heartRateStandaloneValue.textContent = displayValue;

  [ui.heartRatePaired, ui.heartRateStandalone].forEach((element) => {
    element.classList.toggle("is-unavailable", !available);
    element.style.setProperty("--heart-rate-color", `rgb(${red} ${green} ${blue})`);
    element.style.setProperty("--heart-rate-glow", `rgb(${red} ${green} ${blue} / 0.48)`);
    element.style.setProperty("--heart-rate-duration", `${pulseDuration.toFixed(3)}s`);
  });
}

function stopHeartRatePolling() {
  clearTimeout(state.heartRateTimer);
  state.heartRateTimer = null;
}

function setHeartRateConnection(status, label) {
  ui.heartRateDot.dataset.state = status;
  ui.heartRateStatus.textContent = label;
}

function syncHeartRatePolling() {
  const signature = state.settings.heartRate.enabled
    ? `${heartRateHost}:${state.settings.heartRate.port}`
    : "";
  if (signature === state.heartRatePollingSignature) return;

  stopHeartRatePolling();
  state.heartRatePollingSignature = signature;
  state.heartRate = null;
  renderHeartRate();

  if (!signature) {
    setHeartRateConnection("offline", "Heart rate disabled");
    return;
  }

  const poll = async () => {
    if (state.heartRatePollingSignature !== signature) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    try {
      const response = await fetch(`http://${heartRateHost}:${state.settings.heartRate.port}/hr`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HRCounter returned ${response.status}`);
      const bpm = Math.round(Number((await response.text()).trim()));
      if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 300) throw new Error("HRCounter returned no heart rate");
      state.heartRate = bpm;
      setHeartRateConnection("live", `HRCounter connected · ${bpm} BPM`);
    } catch {
      state.heartRate = null;
      setHeartRateConnection("offline", `No HRCounter data on ${heartRateHost}:${state.settings.heartRate.port}`);
    } finally {
      clearTimeout(timeout);
      renderHeartRate();
      if (state.heartRatePollingSignature === signature) {
        state.heartRateTimer = setTimeout(poll, 1000);
      }
    }
  };

  setHeartRateConnection("connecting", "Connecting to HRCounter");
  poll();
}

function setConnection(status, label, detail = `${getDataSourceName()} · ${host}:${getTelemetryPort()}`) {
  ui.connectionDot.dataset.state = status;
  ui.connectionLabel.textContent = label;
  ui.connectionDetail.textContent = detail;
}

function closeSockets() {
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = null;
  clearInterval(state.telemetryClockTimer);
  state.telemetryClockTimer = null;
  state.beatSaberPlusClock = null;
  state.sockets.forEach((socket) => {
    state.intentionalClosures.add(socket);
    socket.close();
  });
  state.sockets = [];
  state.openSockets = 0;
}

function resetTelemetry() {
  state.map = null;
  state.live = null;
  ui.preview.classList.toggle("is-awaiting-data", isOverlayMode);
  ui.preview.classList.remove("is-ended");
  ui.preview.setAttribute("aria-hidden", String(isOverlayMode));
  renderShadow();
}

function scheduleReconnect() {
  clearTimeout(state.reconnectTimer);
  state.reconnectTimer = setTimeout(connectTelemetry, 2500);
}

function getDataSourceSocketUrl(source) {
  return source === "bsplus"
    ? `ws://${host}:${getTelemetryPort(source)}/socket`
    : `ws://${host}:${getTelemetryPort(source)}/BSDataPuller/MapData`;
}

function probeDataSource(source) {
  return new Promise((resolve) => {
    const socket = new WebSocket(getDataSourceSocketUrl(source));
    state.sockets.push(socket);
    let settled = false;

    const finish = (available) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      state.intentionalClosures.add(socket);
      socket.close();
      resolve(available);
    };

    const timeout = setTimeout(() => finish(false), 900);
    socket.addEventListener("open", () => finish(true));
    socket.addEventListener("error", () => finish(false));
    socket.addEventListener("close", () => finish(false));
  });
}

function connectDataPullerEndpoint(path, handler) {
  const socket = new WebSocket(`ws://${host}:${getTelemetryPort("datapuller")}${path}`);
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
    scheduleReconnect();
  });

  socket.addEventListener("error", () => socket.close());
}

function connectDataPuller() {
  setConnection("connecting", "Connecting to DataPuller");

  connectDataPullerEndpoint("/BSDataPuller/MapData", (map) => {
    state.map = map;
    renderMap();
  });
  connectDataPullerEndpoint("/BSDataPuller/LiveData", (live) => {
    state.live = live;
    renderLive();
  });
}

function handleBeatSaberPlusMessage(message) {
  if (message?._type !== "event") return;

  if (message._event === "mapInfo" && message.mapInfoChanged) {
    state.map = adaptBeatSaberPlusMap(message.mapInfoChanged);
    setBeatSaberPlusClock(
      message.mapInfoChanged.time,
      false,
      message.mapInfoChanged.timeMultiplier,
    );
    state.live = adaptBeatSaberPlusScore({
      accuracy: 1,
      currentHealth: 0.5,
      time: message.mapInfoChanged.time,
    });
    renderMap();
    return;
  }

  if (message._event === "score" && message.scoreEvent) {
    state.live = adaptBeatSaberPlusScore(message.scoreEvent);
    setBeatSaberPlusClock(message.scoreEvent.time, state.beatSaberPlusClock?.paused);
    renderLive();
    return;
  }

  if (message._event === "gameState") {
    const inLevel = message.gameStateChanged === "Playing";
    if (state.map) {
      state.map = {
        ...state.map,
        InLevel: inLevel,
        LevelQuit: !inLevel,
      };
      renderMap();
    }
    if (!inLevel && state.beatSaberPlusClock) {
      setBeatSaberPlusClock(getBeatSaberPlusTime(), true);
    }
    return;
  }

  if (message._event === "pause" && state.map) {
    state.map.LevelPaused = true;
    setBeatSaberPlusClock(message.pauseTime, true);
  } else if (message._event === "resume" && state.map) {
    state.map.LevelPaused = false;
    setBeatSaberPlusClock(message.resumeTime, false);
  }
}

function connectBeatSaberPlus() {
  setConnection("connecting", "Connecting to BS+ SO");
  const socket = new WebSocket(`ws://${host}:${getTelemetryPort("bsplus")}/socket`);
  state.sockets.push(socket);
  state.telemetryClockTimer = setInterval(() => {
    if (!state.live || !state.beatSaberPlusClock || state.beatSaberPlusClock.paused) return;
    state.live.TimeElapsed = getBeatSaberPlusTime();
    renderLive();
  }, 250);

  socket.addEventListener("open", () => {
    state.openSockets = 1;
    setConnection("live", "BS+ SO connected");
  });

  socket.addEventListener("message", ({ data }) => {
    if (!String(data).trim()) return;
    try {
      handleBeatSaberPlusMessage(JSON.parse(data));
    } catch (error) {
      console.warn("Ignored invalid BS+ SO message", error);
    }
  });

  socket.addEventListener("close", () => {
    if (state.intentionalClosures.has(socket)) return;
    state.openSockets = 0;
    setConnection("offline", "BS+ SO disconnected");
    scheduleReconnect();
  });

  socket.addEventListener("error", () => socket.close());
}

function connectSelectedTelemetry() {
  closeSockets();
  resetTelemetry();
  if (state.settings.dataSource === "bsplus") connectBeatSaberPlus();
  else connectDataPuller();
}

async function connectTelemetry() {
  const generation = ++state.connectionGeneration;
  closeSockets();
  resetTelemetry();
  state.availableDataSources = [];
  setDataSourceChoiceVisible(false);
  setConnection("connecting", "Finding data providers", "Checking DataPuller or BS+ SO");

  const availability = await Promise.all(
    dataSourceValues.map(async (source) => ({ source, available: await probeDataSource(source) })),
  );
  if (generation !== state.connectionGeneration) return;

  state.availableDataSources = availability
    .filter(({ available }) => available)
    .map(({ source }) => source);
  setDataSourceChoiceVisible(state.availableDataSources.length > 1);

  if (!state.availableDataSources.length) {
    closeSockets();
    setConnection("offline", "No data provider found", "Start Beat Saber with DataPuller or BS+ SO");
    scheduleReconnect();
    return;
  }

  if (state.availableDataSources.length === 1) {
    state.settings.dataSource = state.availableDataSources[0];
    saveSettings();
    renderSettings();
  }

  connectSelectedTelemetry();
}

document.querySelectorAll(".position-grid button[data-position]").forEach((button) => {
  button.addEventListener("click", () => {
    state.settings.position = button.dataset.position;
    saveSettings();
    renderSettings();
  });
});

document.querySelectorAll("[data-heart-rate-position]").forEach((button) => {
  button.addEventListener("click", () => {
    state.settings.heartRate.position = button.dataset.heartRatePosition;
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

ui.dataSource.addEventListener("change", () => {
  state.settings.dataSource = normalizeDataSource(ui.dataSource.value);
  saveSettings();
  renderSettings();
  connectSelectedTelemetry();
});

ui.fontWeight.addEventListener("change", () => {
  state.settings.fontWeight = normalizeFontWeight(ui.fontWeight.value);
  saveSettings();
  renderSettings();
});

ui.fontSize.addEventListener("input", () => {
  state.settings.fontScale = normalizeFontScale(ui.fontSize.value);
  saveSettings();
  renderSettings();
});

ui.textTransform.addEventListener("change", () => {
  state.settings.textTransform = normalizeTextTransform(ui.textTransform.value);
  saveSettings();
  renderSettings();
});

ui.accentColor.addEventListener("input", () => {
  state.settings.accentColor = normalizeAccentColor(ui.accentColor.value);
  saveSettings();
  renderSettings();
});

ui.overlayScale.addEventListener("input", () => {
  state.settings.overlayScale = normalizeOverlayScale(ui.overlayScale.value);
  saveSettings();
  renderSettings();
});

ui.shadowEnabled.addEventListener("change", () => {
  state.settings.shadow.enabled = ui.shadowEnabled.checked;
  saveSettings();
  renderSettings();
});

ui.shadowStrength.addEventListener("input", () => {
  state.settings.shadow.strength = normalizeShadowStrength(ui.shadowStrength.value);
  saveSettings();
  renderSettings();
});

ui.heartRateEnabled.addEventListener("change", () => {
  state.settings.heartRate.enabled = ui.heartRateEnabled.checked;
  saveSettings();
  renderSettings();
});

ui.heartRateModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.settings.heartRate.mode = normalizeHeartRateMode(button.dataset.heartRateMode);
    saveSettings();
    renderSettings();
  });
});

ui.heartRatePort.addEventListener("change", () => {
  state.settings.heartRate.port = normalizePort(ui.heartRatePort.value);
  saveSettings();
  renderSettings();
});

ui.fontSearch.addEventListener("focus", () => {
  ui.fontSearch.select();
  renderFontOptions();
});
ui.fontSearch.addEventListener("click", () => {
  loadLocalFonts();
  renderFontOptions();
});
ui.fontSearch.addEventListener("input", () => {
  state.activeFontIndex = -1;
  renderFontOptions();
});
ui.fontSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    ui.fontSearch.value = getSelectedFontLabel();
    setFontPickerOpen(false);
    ui.fontSearch.blur();
    return;
  }

  if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
  event.preventDefault();
  const fonts = getFilteredFonts();
  if (!fonts.length) return;

  if (event.key === "Enter") {
    if (state.activeFontIndex >= 0) selectFont(fonts[state.activeFontIndex].family);
    return;
  }

  const direction = event.key === "ArrowDown" ? 1 : -1;
  state.activeFontIndex = (state.activeFontIndex + direction + fonts.length) % fonts.length;
  renderFontOptions();
  const activeOption = $(`font-option-${state.activeFontIndex}`);
  ui.fontSearch.setAttribute("aria-activedescendant", activeOption.id);
  activeOption.scrollIntoView({ block: "nearest" });
});

document.addEventListener("pointerdown", (event) => {
  if (!ui.fontPicker.contains(event.target)) setFontPickerOpen(false);
});

$("reset-settings").addEventListener("click", () => {
  state.settings = structuredClone(defaultSettings);
  saveSettings();
  renderSettings();
  connectTelemetry();
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

  ui.copyOverlayUrl.classList.add("is-copied");
  ui.copyOverlayUrlLabel.textContent = "Copied!";
  clearTimeout(ui.copyOverlayUrl.copyResetTimer);
  ui.copyOverlayUrl.copyResetTimer = setTimeout(() => {
    ui.copyOverlayUrl.classList.remove("is-copied");
    ui.copyOverlayUrlLabel.textContent = "Click to copy URL";
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
    const loadedDataSource = loadedUrl.searchParams.get("source");
    const loadedPosition = loadedUrl.searchParams.get("position");
    const loadedVisible = loadedUrl.searchParams.get("show");
    const loadedFont = loadedUrl.searchParams.get("font");
    const loadedWeight = loadedUrl.searchParams.get("weight");
    const loadedScale = loadedUrl.searchParams.get("scale");
    const loadedTextTransform = loadedUrl.searchParams.get("case");
    const loadedAccentColor = loadedUrl.searchParams.get("accent");
    const loadedOverlayScale = loadedUrl.searchParams.get("overlayscale");
    const loadedShadowEnabled = loadedUrl.searchParams.get("shadow");
    const loadedShadowStrength = loadedUrl.searchParams.get("shadowstrength");
    const loadedHeartRateMode = loadedUrl.searchParams.get("hr");
    const loadedHeartRatePosition = loadedUrl.searchParams.get("hrposition");
    const loadedHeartRatePort = loadedUrl.searchParams.get("hrport");

    if (loadedPosition !== null && !positionKeys.includes(loadedPosition)) {
      throw new Error("That URL contains an unsupported overlay position.");
    }

    if (loadedDataSource === null && loadedPosition === null && loadedVisible === null && loadedFont === null && loadedWeight === null &&
      loadedScale === null && loadedTextTransform === null && loadedAccentColor === null &&
      loadedOverlayScale === null && loadedShadowEnabled === null && loadedShadowStrength === null &&
      loadedHeartRateMode === null &&
      loadedHeartRatePosition === null && loadedHeartRatePort === null) {
      throw new Error("That URL does not contain overlay settings.");
    }

    if (loadedHeartRateMode !== null && !heartRateModeValues.includes(loadedHeartRateMode)) {
      throw new Error("That URL contains an unsupported heart rate display mode.");
    }

    if (loadedHeartRatePosition !== null && !positionKeys.includes(loadedHeartRatePosition)) {
      throw new Error("That URL contains an unsupported heart rate position.");
    }

    if (loadedDataSource !== null && !dataSourceValues.includes(loadedDataSource)) {
      throw new Error("That URL contains an unsupported song data source.");
    }

    const nextSettings = structuredClone(state.settings);
    nextSettings.dataSource = loadedDataSource || defaultSettings.dataSource;
    if (loadedPosition !== null) nextSettings.position = loadedPosition;
    if (loadedFont !== null) nextSettings.fontFamily = normalizeFontFamily(loadedFont);
    if (loadedWeight !== null) nextSettings.fontWeight = normalizeFontWeight(loadedWeight);
    if (loadedScale !== null) nextSettings.fontScale = normalizeFontScale(loadedScale);
    if (loadedTextTransform !== null) nextSettings.textTransform = normalizeTextTransform(loadedTextTransform);
    if (loadedAccentColor !== null) nextSettings.accentColor = normalizeAccentColor(loadedAccentColor);
    if (loadedOverlayScale !== null) nextSettings.overlayScale = normalizeOverlayScale(loadedOverlayScale);
    if (loadedShadowEnabled !== null) nextSettings.shadow.enabled = loadedShadowEnabled !== "0";
    if (loadedShadowStrength !== null) {
      nextSettings.shadow.strength = normalizeShadowStrength(loadedShadowStrength);
    }
    if (loadedHeartRateMode !== null) {
      nextSettings.heartRate.enabled = true;
      nextSettings.heartRate.mode = loadedHeartRateMode;
    }
    if (loadedHeartRatePosition !== null) nextSettings.heartRate.position = loadedHeartRatePosition;
    if (loadedHeartRatePort !== null) nextSettings.heartRate.port = normalizePort(loadedHeartRatePort);

    if (loadedVisible !== null) {
      const shown = new Set(loadedVisible.split(",").filter((key) => visibleKeys.includes(key)));
      nextSettings.visible = Object.fromEntries(visibleKeys.map((key) => [key, shown.has(key)]));
    }

    state.settings = nextSettings;
    saveSettings();
    renderSettings();
    connectTelemetry();
    ui.loadSettingsDialog.close();
  } catch (error) {
    ui.loadSettingsError.textContent = error.message || "Enter a valid overlay URL.";
  }
});

ui.coverArt.addEventListener("error", () => {
  ui.coverArt.parentElement.classList.remove("has-image");
});

window.addEventListener("resize", () => {
  updateResolutionScale();
  updateMarquees();
});
document.fonts?.ready.then(updateMarquees);

document.documentElement.classList.toggle("overlay-mode", isOverlayMode);
document.body.classList.toggle("overlay-mode", isOverlayMode);
ui.preview.classList.toggle("is-awaiting-data", isOverlayMode);
updateResolutionScale();
renderSettings();
if (!isOverlayMode) saveSettings();
connectTelemetry();
