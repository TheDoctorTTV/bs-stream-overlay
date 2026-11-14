const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const source = readFileSync(require.resolve("../app.js"), "utf8");

function fixture(provider = "pulsoid", overlay = true) {
  const element = () => {
    const classes = new Set();
    return {
      classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        contains(name) { return classes.has(name); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
      },
      style: { setProperty() {} },
      setAttribute(name, value) { this[name] = value; },
    };
  };
  const ui = Object.fromEntries([
    "preview", "heartRatePaired", "heartRateStandalone", "heartRatePairedValue",
    "heartRateStandaloneValue", "pausedIndicator", "noFailIndicator",
  ].map((key) => [key, element()]));
  const state = {
    settings: { layout: { mode: "custom" }, heartRate: { enabled: true, provider, mode: "paired" } },
    heartRate: 92, providerHeartRate: 92, providerHeartRateAt: Date.now(),
  };
  const context = vm.createContext({
    ui, state, isOverlayMode: overlay, getHeartRateColor: () => [255, 0, 0],
    setHeartRateConnection() {}, getHeartRateProviderLabel: () => provider,
    getHeartRateProviderConfigurationError: () => "", heartRateHost: "localhost",
    resetPlaybackProgress() {}, renderShadow() {},
  });
  for (const [start, end] of [
    ["function renderOverlayVisibility()", "function stopHeartRatePolling()"],
    ["function refreshHeartRate()", "function scheduleHeartRateProviderReconnect("],
    ["function resetTelemetry()", "function scheduleReconnect()"],
  ]) vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  return { ui, state, run: (code) => vm.runInContext(code, context) };
}

for (const provider of ["pulsoid", "hyperate"]) {
  test(`${provider} stays visible through telemetry resets and song endings`, () => {
    const { ui, run } = fixture(provider);
    run("resetTelemetry(); renderHeartRate();");
    assert.equal(ui.preview["aria-hidden"], "false");
    assert.equal(ui.heartRatePaired.hidden, false);
    assert.equal(ui.preview.classList.contains("has-independent-heart-rate"), true);
    ui.preview.classList.remove("is-awaiting-data");
    ui.preview.classList.toggle("is-ended", true);
    run("renderOverlayVisibility();");
    assert.equal(ui.preview["aria-hidden"], "false");
  });
  test(`${provider} hides when readings expire or heart rate is disabled`, () => {
    const { ui, state, run } = fixture(provider);
    run("resetTelemetry(); renderHeartRate();");
    state.providerHeartRateAt = Date.now() - 31000;
    run("refreshHeartRate();");
    assert.equal(ui.preview["aria-hidden"], "true");
    assert.equal(ui.heartRatePaired.hidden, true);
    state.heartRate = 92;
    state.settings.heartRate.enabled = false;
    run("renderHeartRate();");
    assert.equal(ui.preview["aria-hidden"], "true");
  });
}

test("HRCounter and regular paired layouts retain song visibility rules", () => {
  const { ui, state, run } = fixture("hrcounter");
  run("resetTelemetry(); renderHeartRate();");
  assert.equal(ui.preview["aria-hidden"], "true");
  state.settings.heartRate.provider = "pulsoid";
  state.settings.layout.mode = "preset";
  run("renderHeartRate();");
  assert.equal(ui.preview["aria-hidden"], "true");
});

test("returning song telemetry restores the canvas and editor placeholders remain available", () => {
  const { ui, state, run } = fixture();
  run("resetTelemetry(); renderHeartRate();");
  ui.preview.classList.remove("is-awaiting-data");
  state.heartRate = null;
  run("renderHeartRate();");
  assert.equal(ui.preview["aria-hidden"], "false");
  assert.equal(ui.preview.classList.contains("has-independent-heart-rate"), false);
  const editor = fixture("pulsoid", false);
  editor.state.heartRate = null;
  editor.run("resetTelemetry(); renderHeartRate();");
  assert.equal(editor.ui.preview["aria-hidden"], "false");
  assert.equal(editor.ui.heartRatePaired.hidden, false);
});
