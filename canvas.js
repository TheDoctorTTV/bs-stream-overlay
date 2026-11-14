/* Editor-only orientation profiles and locally stored reference images. */
function orientationProfileKey(orientation) {
  return `bs-stream-overlay-canvas-${normalizeOrientation(orientation)}-v1`;
}
function saveOrientationProfile(settings) {
  const profile = structuredClone(settings);
  delete profile.dataSource;
  for (const key of ["provider", "port", "pulsoidToken", "hyperateDeviceId"])
    delete profile.heartRate[key];
  localStorage.setItem(orientationProfileKey(settings.orientation), JSON.stringify(profile));
}
function switchCanvasOrientation(orientation) {
  orientation = normalizeOrientation(orientation);
  if (orientation === state.settings.orientation || layoutHistoryPointerActive) return;
  const message = document.getElementById("orientation-message");
  try {
    // Store the outgoing canvas before restoring the other canvas's appearance.
    saveOrientationProfile(state.settings);
    const stored = JSON.parse(localStorage.getItem(orientationProfileKey(orientation)) || "null");
    const next = { ...structuredClone(defaultSettings), ...stored, orientation };
    next.layout = normalizeLayout(next.layout);
    next.dataSource = state.settings.dataSource;
    next.heartRate = { ...defaultSettings.heartRate, ...stored?.heartRate };
    for (const key of ["provider", "port", "pulsoidToken", "hyperateDeviceId"])
      next.heartRate[key] = state.settings.heartRate[key];
    state.settings = next;
    setLayoutSelection([]);
    message.hidden = true;
    document.getElementById("canvas-background-message").hidden = true;
    renderSettings();
    renderMap();
    saveSettings();
  } catch {
    message.textContent = "Unable to switch canvases. Check this browser’s storage and site permissions.";
    message.hidden = false;
  }
}

const canvasBackgrounds = new Map();
let canvasBackgroundDatabase;
function openCanvasBackgroundDatabase() {
  if (!canvasBackgroundDatabase) {
    canvasBackgroundDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open("bs-stream-overlay-backgrounds", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("backgrounds");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      canvasBackgroundDatabase = null;
      throw error;
    });
  }
  return canvasBackgroundDatabase;
}
async function canvasBackgroundTransaction(mode, operation) {
  const database = await openCanvasBackgroundDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("backgrounds", mode);
    const request = operation(transaction.objectStore("backgrounds"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
function setCanvasBackground(orientation, blob) {
  const old = canvasBackgrounds.get(orientation);
  if (old) URL.revokeObjectURL(old);
  if (blob) canvasBackgrounds.set(orientation, URL.createObjectURL(blob));
  else canvasBackgrounds.delete(orientation);
  renderCanvasBackground();
}
function renderCanvasBackground() {
  if (isOverlayMode) return;
  const stage = document.getElementById("preview-stage");
  const background = canvasBackgrounds.get(state.settings.orientation);
  stage.classList.toggle("has-reference-background", Boolean(background));
  if (background) stage.style.setProperty("--reference-background", `url("${background}")`);
  else stage.style.removeProperty("--reference-background");
  document.getElementById("clear-canvas-background").hidden = !background;
  document.getElementById("canvas-background-hint").textContent =
    `${state.settings.orientation === "vertical" ? "9:16" : "16:9"} PNG, JPG or WebP · up to 10 MB. Saved for this orientation in this browser.`;
}
function renderCanvas() {
  const orientation = normalizeOrientation(state.settings.orientation);
  const { width, height } = getCanvasSize(orientation);
  const stage = document.getElementById("preview-stage");
  stage.style.setProperty("--canvas-width", `${width}px`);
  stage.style.setProperty("--canvas-height", `${height}px`);
  stage.style.setProperty("--canvas-ratio", `${width} / ${height}`);
  stage.dataset.orientation = orientation;
  if (isOverlayMode) return;
  document.querySelectorAll("[data-orientation]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.orientation === orientation));
  });
  const workspace = stage.parentElement;
  const padding = getComputedStyle(workspace);
  const margin = getComputedStyle(stage);
  const availableWidth = workspace.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - parseFloat(margin.marginLeft) - parseFloat(margin.marginRight) - 2;
  const availableHeight = workspace.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - parseFloat(margin.marginTop) - parseFloat(margin.marginBottom) - 2;
  const scale = Math.max(0.01, Math.min(availableWidth / width, availableHeight / height));
  stage.style.width = `${width * scale}px`;
  stage.style.height = `${height * scale}px`;
  renderCanvasBackground();
}
function initializeCanvasControls() {
  if (isOverlayMode) return;
  document.querySelectorAll("[data-orientation]").forEach((button) => {
    button.addEventListener("click", () => switchCanvasOrientation(button.dataset.orientation));
  });
  new ResizeObserver(() => {
    renderCanvas();
    updateResolutionScale();
    renderCustomLayout();
  }).observe(document.querySelector(".preview-workspace"));
  const input = document.getElementById("canvas-background");
  document.getElementById("upload-canvas-background").onclick = () => input.click();
  const message = document.getElementById("canvas-background-message");
  const report = (text, error = false) => {
    message.hidden = false;
    message.textContent = text;
    message.classList.toggle("is-error", error);
  };
  // Serialize image loading and edits so a slow startup read cannot replace a new upload.
  let pending = Promise.all(["horizontal", "vertical"].map(async (orientation) => {
    const blob = await canvasBackgroundTransaction("readonly", (store) => store.get(orientation));
    if (blob instanceof Blob) setCanvasBackground(orientation, blob);
  })).catch(() => report("Saved backgrounds are unavailable. Check this browser’s storage permissions.", true));
  input.addEventListener("change", () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    const orientation = state.settings.orientation;
    pending = pending.then(async () => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error("Choose a PNG, JPG or WebP image up to 10 MB.");
      const image = await createImageBitmap(file);
      const canvas = getCanvasSize(orientation);
      const matches = Math.abs(image.width / image.height / (canvas.width / canvas.height) - 1) <= 0.01;
      image.close();
      if (!matches) throw new Error(`Choose a ${orientation === "vertical" ? "9:16" : "16:9"} image for the ${orientation} canvas.`);
      await canvasBackgroundTransaction("readwrite", (store) => store.put(file, orientation));
      setCanvasBackground(orientation, file);
      report(`Background saved for the ${orientation} canvas.`);
    }).catch((error) => report(error.message || "Unable to save this background.", true));
  });
  document.getElementById("clear-canvas-background").onclick = () => {
    const orientation = state.settings.orientation;
    pending = pending.then(async () => {
      await canvasBackgroundTransaction("readwrite", (store) => store.delete(orientation));
      setCanvasBackground(orientation, null);
      report(`Background removed from the ${orientation} canvas.`);
    }).catch(() => report("Unable to remove this background. Check this browser’s storage permissions.", true));
  };
}
