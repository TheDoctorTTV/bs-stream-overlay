/* Custom layouts use reference-canvas pixels, independent of the browser-source size. */
const layoutNames = {
  cover: "Cover art, time & indicators",
  title: "Song title",
  artist: "Artist",
  mapper: "Mapper",
  difficulty: "Difficulty",
  bpm: "BPM",
  njs: "NJS",
  bsr: "BSR code",
  score: "Score",
  combo: "Combo",
  rank: "Rank",
  accuracy: "Accuracy",
  misses: "Misses",
  health: "Health bar",
  heartRate: "Heart rate",
};
function normalizeLayout(value) {
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    value = null;
  }
  const items = {};
  const number = (v, fallback, min, max) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  for (const key of Object.keys(layoutNames)) {
    const item = value?.items?.[key];
    if (item && typeof item === "object")
      items[key] = {
        x: number(item.x, 34, -1920, 1920),
        y: number(item.y, 34, -1080, 1080),
        scale: number(item.scale, 1, 0.1, 5),
        angle: number(item.angle, 0, -180, 180),
        ...(key === "health"
          ? { width: number(item.width, 720, 96, 1920) }
          : {}),
      };
  }
  return { mode: value?.mode === "custom" ? "custom" : "presets", items };
}
let layoutEditorState;
function layoutDefault(key) {
  const index = Object.keys(layoutNames).indexOf(key);
  const positions = {
    cover: [40, 40],
    title: [190, 40],
    artist: [190, 110],
    mapper: [190, 145],
    difficulty: [190, 190],
    bpm: [340, 190],
    njs: [480, 190],
    bsr: [620, 190],
    score: [800, 40],
    combo: [800, 100],
    rank: [800, 160],
    accuracy: [970, 160],
    misses: [800, 220],
    health: [40, 280],
    heartRate: [1150, 40],
  };
  const [x, y] = positions[key] || [40, 40 + index * 50];
  return {
    x,
    y,
    scale: 1,
    angle: 0,
    ...(key === "health" ? { width: 720 } : {}),
  };
}
function initializeLayoutEditor() {
  const stage = document.getElementById("preview-stage");
  const records = new Map();
  for (const key of Object.keys(layoutNames)) {
    const selector =
      { heartRate: "#heart-rate-paired" }[key] || `[data-preview="${key}"]`;
    const element = ui.preview.querySelector(selector);
    const marker = document.createComment(`layout:${key}`);
    element.before(marker);
    const wrapper = document.createElement("div");
    wrapper.className = "layout-item";
    wrapper.dataset.layoutItem = key;
    wrapper.dataset.label = layoutNames[key];
    records.set(key, { element, marker, wrapper });
  }
  const frame = document.createElement("div");
  frame.className = "layout-selection";
  frame.tabIndex = 0;
  frame.setAttribute(
    "aria-label",
    "Selected element: drag to move, arrow keys to nudge",
  );
  for (const corner of ["nw", "ne", "sw", "se", "n", "s", "w", "e", "rotate"]) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.dataset.handle = corner;
    handle.className = `layout-handle layout-handle--${corner}`;
    handle.setAttribute(
      "aria-label",
      corner === "rotate"
        ? "Rotate selected element"
        : corner === "w" || corner === "e"
          ? `Resize health bar width ${corner}`
          : `Scale selected element ${corner}`,
    );
    frame.append(handle);
  }
  const guides = document.createElement("div");
  guides.className = "layout-guides";
  guides.setAttribute("aria-hidden", "true");
  for (const axis of ["x", "y"]) {
    const line = document.createElement("div");
    line.className = `layout-guide layout-guide--${axis}`;
    line.hidden = true;
    guides.append(line);
  }
  const marquee = document.createElement("div");
  marquee.className = "layout-marquee";
  marquee.hidden = true;
  marquee.setAttribute("aria-hidden", "true");
  layoutEditorState = {
    stage,
    records,
    frame,
    guides,
    selected: "cover",
    selection: new Set(["cover"]),
    groupAngle: 0,
    marquee,
    active: false,
    factor: 1,
  };
  const commit = () => {
    renderSettings();
    saveSettings();
  };
  document.getElementById("custom-layout").onclick = () => {
    state.settings.layout.mode = "custom";
    commit();
  };
  if (!isOverlayMode) {
    initializeLayoutPresets();
    initializeLayoutHistory();
  }
  // Separate row selection from the native checkbox's visibility action.
  document
    .querySelectorAll(
      "[data-toggle], #show-paused, #show-no-fail, #rank-colors, #heart-rate-enabled",
    )
    .forEach((input) => {
      const sourceKey =
        input.dataset.toggle ||
        {
          "show-paused": "cover",
          "show-no-fail": "cover",
          "rank-colors": "rank",
          "heart-rate-enabled": "heartRate",
        }[input.id];
      const key = sourceKey === "time" ? "cover" : sourceKey;
      const label = input.closest(".toggle-row");
      const row = document.createElement("div");
      row.className = label.className;
      row.dataset.selectLayout = key;
      while (label.firstChild) row.append(label.firstChild);
      label.replaceWith(row);
      const text = row.querySelector("span");
      text.id = `layout-row-${sourceKey}-${input.id || "field"}`;
      text.setAttribute("role", "button");
      text.tabIndex = 0;
      text.title = `Select ${layoutNames[key]}`;
      input.setAttribute("aria-labelledby", text.id);
      const choose = (event) => {
        selectLayoutElement(key, event?.shiftKey);
        state.settings.layout.mode = "custom";
        commit();
      };
      row.addEventListener("click", (event) => {
        if (event.target === input) return;
        if (event.target.closest("i")) {
          if (!input.disabled) input.click();
          return;
        }
        choose(event);
      });
      text.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(event);
        }
      });
    });
  for (const property of ["x", "y", "scale", "angle"]) {
    document.getElementById(`layout-${property}`).onchange = (event) => {
      const key = layoutEditorState.selected;
      if (!key) return;
      const value = Number(event.target.value);
      if (!Number.isFinite(value)) return;
      if (layoutEditorState.selection.size > 1) {
        editLayoutGroup(property, value);
        commit();
        return;
      }
      state.settings.layout.items[key][property] =
        property === "scale" ? value / 100 : value;
      state.settings.layout = normalizeLayout(state.settings.layout);
      constrainLayoutItem(state.settings.layout.items[key], editorBox(key));
      commit();
    };
  }
  document.getElementById("layout-reset").onclick = () => {
    if (!layoutEditorState.selected) return;
    for (const key of layoutEditorState.selection)
      state.settings.layout.items[key] = layoutDefault(key);
    layoutEditorState.groupAngle = 0;
    commit();
  };
  document.getElementById("layout-reset-all").onclick = () => {
    state.settings.layout.items = Object.fromEntries(
      Object.keys(layoutNames).map((key) => [key, layoutDefault(key)]),
    );
    commit();
  };
  stage.addEventListener("pointerdown", (event) => {
    if (isOverlayMode || !layoutEditorState.active || event.button !== 0)
      return;
    let target = event.target.closest("[data-layout-item]");
    if (!target && event.shiftKey && frame.contains(event.target)) {
      target = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest("[data-layout-item]"))
        .find(Boolean);
    }
    if (!target && !frame.contains(event.target)) {
      startLayoutMarquee(event);
      return;
    }
    event.preventDefault();
    if (target && event.shiftKey) {
      selectLayoutElement(target.dataset.layoutItem, true);
      renderCustomLayout();
      return;
    }
    if (target && !layoutEditorState.selection.has(target.dataset.layoutItem))
      selectLayoutElement(target.dataset.layoutItem);
    if (layoutEditorState.selection.size > 1) {
      startLayoutGroupDrag(event, commit);
      return;
    }
    renderCustomLayout();
    frame.focus({ preventScroll: true });
    const key = layoutEditorState.selected;
    const start = { ...state.settings.layout.items[key] };
    const handle = event.target.dataset.handle;
    const rect = stage.getBoundingClientRect();
    const factor = layoutEditorState.factor;
    const point = (e) => ({
      x: (e.clientX - rect.left) / factor,
      y: (e.clientY - rect.top) / factor,
    });
    const origin = point(event);
    const box = editorBox(key);
    const center = {
      x: start.x + (box.width * start.scale) / 2,
      y: start.y + (box.height * start.scale) / 2,
    };
    const distance = (p) => Math.hypot(p.x - center.x, p.y - center.y);
    const angle = (p) =>
      (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
    stage.setPointerCapture(event.pointerId);
    const move = (e) => {
      const p = point(e);
      const item = state.settings.layout.items[key];
      if (handle === "rotate")
        item.angle =
          ((start.angle + angle(p) - angle(origin) + 540) % 360) - 180;
      else if (key === "health" && (handle === "w" || handle === "e")) {
        Object.assign(
          item,
          resizeHealthWidth(start, box, handle, p.x - origin.x, p.y - origin.y),
        );
      } else if (handle) {
        item.scale = Math.max(
          0.1,
          Math.min(
            5,
            (start.scale * distance(p)) / Math.max(1, distance(origin)),
          ),
        );
        item.x = center.x - (box.width * item.scale) / 2;
        item.y = center.y - (box.height * item.scale) / 2;
      } else {
        item.x = start.x + p.x - origin.x;
        item.y = start.y + p.y - origin.y;
      }
      const currentBox =
        key === "health" && (handle === "w" || handle === "e")
          ? { ...box, width: item.width }
          : box;
      constrainLayoutItem(item, currentBox);
      showLayoutGuides();
      if (!handle && !e.altKey) {
        const targets = [];
        for (const [otherKey, record] of layoutEditorState.records) {
          if (otherKey === key || !layoutElementVisible(record)) continue;
          const otherBox = editorBox(otherKey);
          if (otherBox.width && otherBox.height)
            targets.push(
              layoutBounds(state.settings.layout.items[otherKey], otherBox),
            );
        }
        const snapped = snapLayoutItem(item, box, targets, factor);
        Object.assign(item, snapped.item);
        showLayoutGuides(snapped.guides);
      }
      renderCustomLayout();
    };
    const end = (e) => {
      showLayoutGuides();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", end);
      stage.removeEventListener("pointercancel", cancel);
      if (stage.hasPointerCapture(event.pointerId))
        stage.releasePointerCapture(event.pointerId);
      commit();
    };
    const cancel = (e) => {
      state.settings.layout.items[key] = start;
      end(e);
    };
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", cancel);
  });
  frame.onkeydown = (event) => {
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!delta || !layoutEditorState.selected) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    if (layoutEditorState.selection.size > 1) {
      applyLayoutGroup(
        moveLayoutGroup(
          layoutGroupSnapshot(),
          delta[0] * step,
          delta[1] * step,
        ),
      );
      commit();
      return;
    }
    const item = state.settings.layout.items[layoutEditorState.selected];
    item.x += delta[0] * step;
    item.y += delta[1] * step;
    constrainLayoutItem(item, editorBox(layoutEditorState.selected));
    commit();
  };
  new ResizeObserver(() => renderCustomLayout()).observe(stage);
}
function renderCustomLayout() {
  if (!layoutEditorState) initializeLayoutEditor();
  const editor = layoutEditorState;
  const active = state.settings.layout.mode === "custom";
  if (active !== editor.active) {
    editor.active = active;
    for (const { element, marker, wrapper } of editor.records.values()) {
      if (active) {
        wrapper.append(element);
        ui.preview.append(wrapper);
      } else {
        marker.after(element);
        wrapper.remove();
      }
    }
    if (active && !isOverlayMode)
      ui.preview.append(editor.guides, editor.marquee, editor.frame);
    else {
      editor.frame.remove();
      editor.guides.remove();
      editor.marquee.remove();
    }
  }
  editor.stage.classList.toggle("custom-layout-stage", active);
  ui.preview.classList.toggle("custom-layout-canvas", active);
  document.getElementById("layout-editor").hidden = !active;
  ui.overlayScale.disabled = active;
  document.getElementById("overlay-scale-help").textContent = active
    ? "Use the selected element’s Scale control in custom layout."
    : "100% matches 1080p DPI scaling";
  document.querySelector(".heart-rate-mode-picker").hidden = active;
  if (active) ui.heartRatePositionSettings.hidden = true;
  document
    .getElementById("custom-layout")
    .setAttribute("aria-pressed", String(active));
  document.querySelectorAll("[data-position]").forEach((button) => {
    if (button.tagName === "BUTTON")
      button.setAttribute(
        "aria-pressed",
        String(!active && button.dataset.position === state.settings.position),
      );
  });
  document.querySelectorAll("[data-select-layout]").forEach((row) => {
    const selected = active && editor.selection.has(row.dataset.selectLayout);
    row.classList.toggle("is-layout-selected", selected);
    row
      .querySelector("[role=button]")
      .setAttribute("aria-pressed", String(selected));
  });
  if (!active) return;
  editor.factor = Math.min(
    editor.stage.clientWidth / 1920,
    editor.stage.clientHeight / 1080,
  );
  ui.preview.style.setProperty("--custom-canvas-scale", editor.factor);
  ui.preview.style.setProperty(
    "--handle-size",
    `${10 / Math.max(0.01, editor.factor)}px`,
  );
  for (const [key, { element, wrapper }] of editor.records) {
    const item = (state.settings.layout.items[key] ||= layoutDefault(key));
    if (key === "health")
      wrapper.style.setProperty(
        "--health-layout-width",
        `${item.width || 720}px`,
      );
    wrapper.style.left = `${item.x}px`;
    wrapper.style.top = `${item.y}px`;
    // Compensate for center-origin scaling so X/Y describe the unrotated box.
    wrapper.style.translate = `${(item.scale - 1) * 50}% ${(item.scale - 1) * 50}%`;
    wrapper.style.transform = `rotate(${item.angle}deg) scale(${item.scale})`;
    let enabled = state.settings.visible[key] !== false;
    if (key === "heartRate") enabled = state.settings.heartRate.enabled;
    wrapper.hidden = !enabled;
    wrapper.classList.toggle(
      "is-layout-selected",
      !isOverlayMode && editor.selection.has(key),
    );
    wrapper.classList.toggle(
      "layout-placeholder",
      !isOverlayMode &&
        (element.hidden || element.classList.contains("is-hidden")),
    );
  }
  if (isOverlayMode) return;
  if (editor.selection.size > 1) {
    const visible = [...editor.selection].filter((key) =>
      layoutElementVisible(editor.records.get(key)),
    );
    if (visible.length !== editor.selection.size) setLayoutSelection(visible);
  }
  if (editor.selection.size > 1) {
    renderLayoutGroupSelection();
    return;
  }
  const key = editor.selected;
  const frame = editor.frame;
  document.getElementById("layout-selected-name").textContent = key
    ? layoutNames[key]
    : "None selected";
  document.getElementById("layout-reset").disabled = !key;
  for (const prop of ["x", "y", "scale", "angle"]) {
    const input = document.getElementById(`layout-${prop}`);
    input.disabled = !key;
    if (!key) input.value = "";
  }
  if (!key) {
    frame.hidden = true;
    return;
  }
  const item = state.settings.layout.items[key],
    record = editor.records.get(key);
  for (const handle of frame.querySelectorAll("[data-handle]")) {
    handle.hidden =
      ["n", "s", "w", "e"].includes(handle.dataset.handle) && key !== "health";
  }
  frame.setAttribute(
    "aria-label",
    "Selected element: drag to move, arrow keys to nudge",
  );
  frame.hidden = record.wrapper.hidden;
  frame.style.left = `${item.x}px`;
  frame.style.top = `${item.y}px`;
  frame.style.width = `${record.wrapper.offsetWidth * item.scale}px`;
  frame.style.height = `${record.wrapper.offsetHeight * item.scale}px`;
  frame.style.transform = `rotate(${item.angle}deg)`;
  document.getElementById("layout-selected-name").textContent =
    layoutNames[key];
  for (const prop of ["x", "y", "scale", "angle"]) {
    const input = document.getElementById(`layout-${prop}`);
    if (document.activeElement !== input)
      input.value =
        Math.round(item[prop] * (prop === "scale" ? 100 : 1) * 10) / 10;
  }
}

function editorBox(key) {
  const wrapper = layoutEditorState.records.get(key).wrapper;
  return { width: wrapper.offsetWidth, height: wrapper.offsetHeight };
}

// Axis-aligned bounds of the rotated element, in reference-canvas pixels.
function layoutBounds(item, box) {
  const angle = (item.angle * Math.PI) / 180;
  const width = box.width * item.scale;
  const height = box.height * item.scale;
  const extentX =
    (Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))) /
    2;
  const extentY =
    (Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))) /
    2;
  const cx = item.x + width / 2,
    cy = item.y + height / 2;
  return {
    left: cx - extentX,
    right: cx + extentX,
    top: cy - extentY,
    bottom: cy + extentY,
    cx,
    cy,
  };
}

function constrainLayoutItem(item, box) {
  if (!box.width || !box.height) return item;
  let bounds = layoutBounds(item, box);
  const fit = Math.min(
    1,
    1920 / (bounds.right - bounds.left),
    1080 / (bounds.bottom - bounds.top),
  );
  if (fit < 1) {
    item.scale *= fit;
    item.x = bounds.cx - (box.width * item.scale) / 2;
    item.y = bounds.cy - (box.height * item.scale) / 2;
    bounds = layoutBounds(item, box);
  }
  item.x += Math.max(0, -bounds.left) - Math.max(0, bounds.right - 1920);
  item.y += Math.max(0, -bounds.top) - Math.max(0, bounds.bottom - 1080);
  return item;
}

function snapLayoutItem(original, box, targets, factor) {
  const item = { ...original };
  const bounds = layoutBounds(item, box);
  const threshold = 6 / Math.max(0.01, factor);
  const proximity = 80 / Math.max(0.01, factor);
  const guides = {};
  for (const axis of ["x", "y"]) {
    const keys =
      axis === "x" ? ["left", "cx", "right"] : ["top", "cy", "bottom"];
    const limit = axis === "x" ? 1920 : 1080;
    const candidates = [0, limit / 2, limit];
    for (const target of targets) {
      const gap =
        axis === "x"
          ? Math.max(0, target.top - bounds.bottom, bounds.top - target.bottom)
          : Math.max(0, target.left - bounds.right, bounds.left - target.right);
      if (gap <= proximity) candidates.push(...keys.map((key) => target[key]));
    }
    let best;
    for (const coordinate of candidates)
      for (const key of keys) {
        const delta = coordinate - bounds[key];
        const low = bounds[keys[0]] + delta,
          high = bounds[keys[2]] + delta;
        if (low < -1e-7 || high > limit + 1e-7) continue;
        if (
          Math.abs(delta) <= threshold &&
          (!best || Math.abs(delta) < Math.abs(best.delta))
        )
          best = { delta, coordinate };
      }
    if (best) {
      item[axis] += best.delta;
      guides[axis] = best.coordinate;
    }
  }
  return { item, guides };
}

function showLayoutGuides(coordinates = {}) {
  for (const [index, axis] of ["x", "y"].entries()) {
    const line = layoutEditorState.guides.children[index];
    line.hidden = coordinates[axis] === undefined;
    if (!line.hidden)
      line.style[axis === "x" ? "left" : "top"] = `${coordinates[axis]}px`;
  }
}

// Change only the health meter's width, using movement along its rotated X axis.
function resizeHealthWidth(start, box, handle, dx, dy) {
  const radians = (start.angle * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians)),
    sine = Math.abs(Math.sin(radians));
  const maximum = Math.min(
    1920,
    cosine > 1e-8
      ? (1920 / start.scale - box.height * sine) / cosine
      : Infinity,
    sine > 1e-8 ? (1080 / start.scale - box.height * cosine) / sine : Infinity,
  );
  const delta = (dx * Math.cos(radians) + dy * Math.sin(radians)) / start.scale;
  const width = Math.max(
    Math.min(96, maximum),
    Math.min(maximum, box.width + (handle === "e" ? 2 : -2) * delta),
  );
  return {
    ...start,
    width,
    x: start.x + ((box.width - width) * start.scale) / 2,
  };
}

const layoutPresetsStorageKey = "bs-stream-overlay-layout-presets-v1";
function readLayoutPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutPresetsStorageKey));
    return Array.from({ length: 3 }, (_, index) =>
      Array.isArray(saved) && typeof saved[index] === "string" && saved[index]
        ? saved[index]
        : null,
    );
  } catch {
    return [null, null, null];
  }
}

function initializeLayoutPresets() {
  const container = document.getElementById("layout-presets");
  const message = document.getElementById("layout-preset-message");
  const report = (text, error = false) => {
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle("is-error", error);
  };
  const render = () => {
    const slots = readLayoutPresets();
    container.replaceChildren();
    slots.forEach((url, index) => {
      const number = index + 1;
      const row = document.createElement("div");
      row.className = "layout-preset-slot";
      const action = document.createElement("button");
      action.type = "button";
      action.className = "layout-preset-button";
      action.textContent = `${url ? "Load" : "Save"} preset ${number}`;
      action.onclick = () => {
        try {
          const current = readLayoutPresets();
          if (current[index]) {
            // URLs omit default values: start from defaults to restore the saved appearance exactly.
            const base = structuredClone(defaultSettings);
            base.heartRate.pulsoidToken = state.settings.heartRate.pulsoidToken;
            base.heartRate.hyperateDeviceId =
              state.settings.heartRate.hyperateDeviceId;
            const next = settingsFromOverlayUrl(current[index], base);
            if (next.layout.mode !== "custom")
              throw new Error("This preset does not contain a custom layout.");
            state.settings = next;
            setLayoutSelection([]);
            renderSettings();
            saveSettings();
            connectTelemetry();
            report(`Preset ${number} loaded.`);
          } else {
            current[index] = buildOverlayUrl();
            localStorage.setItem(
              layoutPresetsStorageKey,
              JSON.stringify(current),
            );
            report(`Preset ${number} saved.`);
          }
          render();
          container.querySelectorAll(".layout-preset-button")[index].focus();
        } catch (error) {
          report(
            error.name === "QuotaExceededError" ||
              error.name === "SecurityError"
              ? "Unable to save presets in this browser. Check available storage and site permissions."
              : error.message || "Unable to load this preset.",
            true,
          );
        }
      };
      row.append(action);
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "layout-icon-button";
      clear.setAttribute("aria-label", `Clear preset ${number}`);
      clear.title = `Clear preset ${number}`;
      clear.hidden = !url;
      clear.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 10v7M14 10v7" /></svg>';
      clear.onclick = () => {
        try {
          const current = readLayoutPresets();
          current[index] = null;
          localStorage.setItem(
            layoutPresetsStorageKey,
            JSON.stringify(current),
          );
          render();
          report(`Preset ${number} cleared.`);
          container.querySelectorAll(".layout-preset-button")[index].focus();
        } catch {
          report(
            "Unable to clear this preset. Check this browser’s site permissions.",
            true,
          );
        }
      };
      row.append(clear);
      container.append(row);
    });
  };
  render();
  window.addEventListener("storage", (event) => {
    if (event.key === layoutPresetsStorageKey || event.key === null) render();
  });
}

function setLayoutSelection(keys) {
  layoutEditorState.selection = new Set(keys);
  layoutEditorState.selected =
    layoutEditorState.selection.values().next().value || null;
  layoutEditorState.groupAngle = 0;
}

function selectLayoutElement(key, additive = false) {
  const keys = additive ? new Set(layoutEditorState.selection) : new Set();
  if (additive && keys.has(key)) keys.delete(key);
  else keys.add(key);
  setLayoutSelection(keys);
}

function layoutElementVisible(record) {
  // Native `hidden` can mean live data is missing (for example, BSR).
  // The editor still shows an enabled placeholder that can be selected and moved.
  return (
    !record.wrapper.hidden && !record.element.classList.contains("is-hidden")
  );
}

function layoutPointer(event) {
  const editor = layoutEditorState,
    rect = editor.stage.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - editor.stage.clientLeft) / editor.factor,
    y: (event.clientY - rect.top - editor.stage.clientTop) / editor.factor,
  };
}

function startLayoutMarquee(event) {
  event.preventDefault();
  const editor = layoutEditorState,
    origin = layoutPointer(event);
  const previous = [...editor.selection];
  const initial = event.shiftKey ? previous : [];
  setLayoutSelection(initial);
  showLayoutGuides();
  renderCustomLayout();
  const move = (e) => {
    const point = layoutPointer(e);
    if (
      editor.marquee.hidden &&
      Math.hypot(point.x - origin.x, point.y - origin.y) * editor.factor < 3
    )
      return;
    const area = {
      left: Math.max(0, Math.min(origin.x, point.x)),
      top: Math.max(0, Math.min(origin.y, point.y)),
      right: Math.min(1920, Math.max(origin.x, point.x)),
      bottom: Math.min(1080, Math.max(origin.y, point.y)),
    };
    Object.assign(editor.marquee.style, {
      left: `${area.left}px`,
      top: `${area.top}px`,
      width: `${area.right - area.left}px`,
      height: `${area.bottom - area.top}px`,
    });
    editor.marquee.hidden = false;
    const keys = new Set(initial);
    for (const [key, record] of editor.records) {
      if (!layoutElementVisible(record)) continue;
      const bounds = layoutBounds(
        state.settings.layout.items[key],
        editorBox(key),
      );
      if (
        bounds.right >= area.left &&
        bounds.left <= area.right &&
        bounds.bottom >= area.top &&
        bounds.top <= area.bottom
      )
        keys.add(key);
    }
    setLayoutSelection(keys);
    renderCustomLayout();
  };
  const end = (e) => {
    editor.stage.removeEventListener("pointermove", move);
    editor.stage.removeEventListener("pointerup", end);
    editor.stage.removeEventListener("pointercancel", cancel);
    editor.marquee.hidden = true;
    if (editor.stage.hasPointerCapture(event.pointerId))
      editor.stage.releasePointerCapture(event.pointerId);
    renderCustomLayout();
    if (editor.selected) editor.frame.focus({ preventScroll: true });
  };
  const cancel = (e) => {
    setLayoutSelection(previous);
    end(e);
  };
  editor.stage.setPointerCapture(event.pointerId);
  editor.stage.addEventListener("pointermove", move);
  editor.stage.addEventListener("pointerup", end);
  editor.stage.addEventListener("pointercancel", cancel);
}

function layoutGroupSnapshot() {
  return [...layoutEditorState.selection].map((key) => ({
    key,
    item: { ...state.settings.layout.items[key] },
    box: editorBox(key),
  }));
}

function layoutGroupBounds(entries) {
  const bounds = entries.map((entry) => layoutBounds(entry.item, entry.box));
  const left = Math.min(...bounds.map((b) => b.left)),
    right = Math.max(...bounds.map((b) => b.right));
  const top = Math.min(...bounds.map((b) => b.top)),
    bottom = Math.max(...bounds.map((b) => b.bottom));
  return {
    left,
    right,
    top,
    bottom,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  };
}

// A common correction keeps relative spacing and individual scales intact at canvas edges.
function moveLayoutGroup(entries, dx, dy) {
  const bounds = layoutGroupBounds(entries);
  dx = Math.max(-bounds.left, Math.min(1920 - bounds.right, dx));
  dy = Math.max(-bounds.top, Math.min(1080 - bounds.bottom, dy));
  return entries.map((entry) => ({
    ...entry,
    item: { ...entry.item, x: entry.item.x + dx, y: entry.item.y + dy },
  }));
}

function rotateLayoutGroup(entries, degrees) {
  const pivot = layoutGroupBounds(entries),
    angle = (degrees * Math.PI) / 180;
  const rotated = entries.map((entry) => {
    const center = layoutBounds(entry.item, entry.box),
      dx = center.cx - pivot.cx,
      dy = center.cy - pivot.cy;
    return {
      ...entry,
      item: {
        ...entry.item,
        x:
          pivot.cx +
          dx * Math.cos(angle) -
          dy * Math.sin(angle) -
          (entry.box.width * entry.item.scale) / 2,
        y:
          pivot.cy +
          dx * Math.sin(angle) +
          dy * Math.cos(angle) -
          (entry.box.height * entry.item.scale) / 2,
        angle: ((((entry.item.angle + degrees + 180) % 360) + 360) % 360) - 180,
      },
    };
  });
  const bounds = layoutGroupBounds(rotated);
  if (
    bounds.right - bounds.left > 1920 + 1e-6 ||
    bounds.bottom - bounds.top > 1080 + 1e-6
  )
    return null;
  return moveLayoutGroup(rotated, 0, 0);
}

function applyLayoutGroup(entries) {
  if (!entries) return;
  for (const entry of entries)
    state.settings.layout.items[entry.key] = { ...entry.item };
}

function editLayoutGroup(property, value) {
  const entries = layoutGroupSnapshot(),
    bounds = layoutGroupBounds(entries);
  if (property === "x" || property === "y")
    applyLayoutGroup(
      moveLayoutGroup(
        entries,
        property === "x" ? value - bounds.left : 0,
        property === "y" ? value - bounds.top : 0,
      ),
    );
  if (property === "angle") {
    const next = rotateLayoutGroup(
      entries,
      value - layoutEditorState.groupAngle,
    );
    if (next) {
      applyLayoutGroup(next);
      layoutEditorState.groupAngle = value;
    }
  }
}

function renderLayoutGroupSelection() {
  const editor = layoutEditorState,
    bounds = layoutGroupBounds(layoutGroupSnapshot()),
    frame = editor.frame;
  frame.hidden = false;
  Object.assign(frame.style, {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.right - bounds.left}px`,
    height: `${bounds.bottom - bounds.top}px`,
    transform: "none",
  });
  frame.setAttribute(
    "aria-label",
    `${editor.selection.size} selected elements: drag to move, use the round handle to rotate`,
  );
  for (const handle of frame.querySelectorAll("[data-handle]"))
    handle.hidden = handle.dataset.handle !== "rotate";
  document.getElementById("layout-selected-name").textContent =
    `${editor.selection.size} elements selected`;
  document.getElementById("layout-reset").disabled = false;
  for (const prop of ["x", "y", "scale", "angle"]) {
    const input = document.getElementById(`layout-${prop}`);
    input.disabled = prop === "scale";
    const value = { x: bounds.left, y: bounds.top, angle: editor.groupAngle }[
      prop
    ];
    if (document.activeElement !== input)
      input.value = prop === "scale" ? "" : Math.round(value * 10) / 10;
  }
}

function startLayoutGroupDrag(event, commit) {
  const editor = layoutEditorState,
    entries = layoutGroupSnapshot(),
    bounds = layoutGroupBounds(entries);
  const origin = layoutPointer(event),
    initialAngle = editor.groupAngle;
  const rotating = event.target.dataset.handle === "rotate";
  const angle = (p) =>
    (Math.atan2(p.y - bounds.cy, p.x - bounds.cx) * 180) / Math.PI;
  editor.frame.focus({ preventScroll: true });
  const move = (e) => {
    const point = layoutPointer(e);
    showLayoutGuides();
    if (rotating) {
      const delta = ((angle(point) - angle(origin) + 540) % 360) - 180;
      const next = rotateLayoutGroup(entries, delta);
      if (next) {
        applyLayoutGroup(next);
        editor.groupAngle = ((initialAngle + delta + 540) % 360) - 180;
      }
    } else {
      let next = moveLayoutGroup(
        entries,
        point.x - origin.x,
        point.y - origin.y,
      );
      if (!e.altKey) {
        const current = layoutGroupBounds(next),
          box = {
            width: current.right - current.left,
            height: current.bottom - current.top,
          };
        const targets = [];
        for (const [key, record] of editor.records)
          if (!editor.selection.has(key) && layoutElementVisible(record))
            targets.push(
              layoutBounds(state.settings.layout.items[key], editorBox(key)),
            );
        const snapped = snapLayoutItem(
          { x: current.left, y: current.top, scale: 1, angle: 0 },
          box,
          targets,
          editor.factor,
        );
        next = moveLayoutGroup(
          next,
          snapped.item.x - current.left,
          snapped.item.y - current.top,
        );
        showLayoutGuides(snapped.guides);
      }
      applyLayoutGroup(next);
    }
    renderCustomLayout();
  };
  const end = (e) => {
    editor.stage.removeEventListener("pointermove", move);
    editor.stage.removeEventListener("pointerup", end);
    editor.stage.removeEventListener("pointercancel", cancel);
    if (editor.stage.hasPointerCapture(event.pointerId))
      editor.stage.releasePointerCapture(event.pointerId);
    showLayoutGuides();
    commit();
  };
  const cancel = (e) => {
    applyLayoutGroup(entries);
    editor.groupAngle = initialAngle;
    end(e);
  };
  editor.stage.setPointerCapture(event.pointerId);
  editor.stage.addEventListener("pointermove", move);
  editor.stage.addEventListener("pointerup", end);
  editor.stage.addEventListener("pointercancel", cancel);
}

// Store committed edits, so a pointer gesture is a single undo step.
function createLayoutHistory(limit = 100) {
  const entries = [];
  let index = -1;
  return {
    push(snapshot, signature) {
      if (entries[index]?.signature === signature) {
        entries[index] = { snapshot, signature };
        return;
      }
      entries.splice(index + 1);
      entries.push({ snapshot, signature });
      if (entries.length > limit + 1) entries.shift();
      index = entries.length - 1;
    },
    undo() {
      return index > 0 ? entries[--index].snapshot : null;
    },
    redo() {
      return index < entries.length - 1 ? entries[++index].snapshot : null;
    },
    get canUndo() {
      return index > 0;
    },
    get canRedo() {
      return index < entries.length - 1;
    },
  };
}
const layoutHistory = createLayoutHistory();
let applyingLayoutHistory = false;
let layoutHistoryPointerActive = false;

function layoutHistorySettings(settings) {
  const snapshot = structuredClone(settings);
  snapshot.layout = normalizeLayout(snapshot.layout);
  for (const key of Object.keys(layoutNames))
    snapshot.layout.items[key] ||= layoutDefault(key);
  // Authentication and provider connection details are not canvas edits.
  for (const key of ["provider", "port", "pulsoidToken", "hyperateDeviceId"])
    delete snapshot.heartRate[key];
  return snapshot;
}

function layoutHistorySignature(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(layoutHistorySignature).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (key) => JSON.stringify(key) + ":" + layoutHistorySignature(value[key]),
      )
      .join(",") +
    "}"
  );
}

function recordLayoutHistory() {
  if (isOverlayMode || applyingLayoutHistory) return;
  const settings = layoutHistorySettings(state.settings);
  layoutHistory.push(
    {
      settings,
      selection: [...(layoutEditorState?.selection || [])],
      groupAngle: layoutEditorState?.groupAngle || 0,
    },
    layoutHistorySignature(settings),
  );
  updateLayoutHistoryControls();
}

function updateLayoutHistoryControls() {
  const undo = document.getElementById("layout-undo"),
    redo = document.getElementById("layout-redo");
  if (undo) undo.disabled = !layoutHistory.canUndo;
  if (redo) redo.disabled = !layoutHistory.canRedo;
}

function restoreLayoutHistory(redo = false) {
  if (layoutHistoryPointerActive) return;
  // Commit a typed transform before undoing it, then let the controls refresh.
  const focused = document.activeElement;
  if (focused?.matches(".layout-properties input")) focused.blur();
  const snapshot = redo ? layoutHistory.redo() : layoutHistory.undo();
  if (!snapshot) return;
  const dataSource = state.settings.dataSource;
  const connection = Object.fromEntries(
    ["provider", "port", "pulsoidToken", "hyperateDeviceId"].map((key) => [
      key,
      state.settings.heartRate[key],
    ]),
  );
  applyingLayoutHistory = true;
  try {
    state.settings = structuredClone(snapshot.settings);
    Object.assign(state.settings.heartRate, connection);
    const selected = [...layoutEditorState.selection];
    layoutEditorState.groupAngle =
      selected.length === snapshot.selection.length &&
      selected.every((key) => snapshot.selection.includes(key))
        ? snapshot.groupAngle
        : 0;
    activeAccentStop = 0;
    accentPickerOpen = false;
    renderSettings();
    renderMap();
    saveSettings();
    if (dataSource !== state.settings.dataSource) connectTelemetry();
  } finally {
    applyingLayoutHistory = false;
    updateLayoutHistoryControls();
  }
}

function initializeLayoutHistory() {
  document.getElementById("layout-undo").onclick = () => restoreLayoutHistory();
  document.getElementById("layout-redo").onclick = () =>
    restoreLayoutHistory(true);
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest("#preview-stage"))
        layoutHistoryPointerActive = true;
    },
    true,
  );
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    document.addEventListener(
      type,
      () => {
        layoutHistoryPointerActive = false;
      },
      true,
    );
  document.addEventListener("keydown", (event) => {
    if (
      !(event.ctrlKey || event.metaKey) ||
      event.altKey ||
      event.key.toLowerCase() !== "z" ||
      event.isComposing ||
      layoutHistoryPointerActive
    )
      return;
    const target = event.target;
    if (
      document.querySelector("dialog[open]") ||
      target.isContentEditable ||
      target.closest("textarea") ||
      (target.closest(
        "input:not([type=checkbox]):not([type=range]):not([type=color])",
      ) &&
        !target.closest(".layout-properties"))
    )
      return;
    event.preventDefault();
    restoreLayoutHistory(event.shiftKey);
  });
}
