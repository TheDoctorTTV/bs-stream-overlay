const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const source = readFileSync(require.resolve("../layout.js"), "utf8");
function geometry(orientation) {
  const context = vm.createContext({ state: { settings: { orientation } } });
  vm.runInContext(source + `\nthis.api = {getCanvasSize, normalizeLayout, layoutDefault, layoutBounds,
    constrainLayoutItem, snapLayoutItem, resizeHealthWidth, moveLayoutGroup, rotateLayoutGroup};`, context);
  return context.api;
}
for (const orientation of ["horizontal", "vertical"]) {
  test(`${orientation}: rotated and oversized elements stay inside the selected canvas`, () => {
    const g = geometry(orientation);
    const canvas = g.getCanvasSize(orientation);
    for (const angle of [-180, -135, -90, -45, 0, 30, 90, 135, 180]) {
      for (const [x, y] of [[-100, -100], [1900, 1900], [800, 1400]]) {
        const item = { x, y, angle, scale: 5 };
        const box = { width: 720, height: 126 };
        g.constrainLayoutItem(item, box);
        const bounds = g.layoutBounds(item, box);
        assert.ok(bounds.left >= -1e-6 && bounds.top >= -1e-6);
        assert.ok(bounds.right <= canvas.width + 1e-6 && bounds.bottom <= canvas.height + 1e-6);
      }
    }
  });
  test(`${orientation}: snapping and health resizing use the selected dimensions`, () => {
    const g = geometry(orientation), canvas = g.getCanvasSize(orientation);
    const item = { x: canvas.width - 126 - 8, y: canvas.height - 126 - 8, angle: 0, scale: 1 };
    const snapped = g.snapLayoutItem(item, { width: 126, height: 126 }, [], .5);
    assert.equal(snapped.guides.x, canvas.width);
    assert.equal(snapped.guides.y, canvas.height);
    const resized = g.resizeHealthWidth({ x: 100, y: 100, angle: 0, scale: 1 }, { width: 720, height: 40 }, "e", 10000, 0);
    assert.equal(resized.width, canvas.width);
  });
  test(`${orientation}: groups stop at the canvas boundary and rotations fit`, () => {
    const g = geometry(orientation), canvas = g.getCanvasSize(orientation);
    const entries = [0, 250].map((x) => ({ item: { x, y: 1200, scale: 1, angle: 0 }, box: { width: 126, height: 126 } }));
    const moved = g.moveLayoutGroup(entries, 10000, 10000);
    const bounds = moved.map((entry) => g.layoutBounds(entry.item, entry.box));
    assert.equal(Math.max(...bounds.map((b) => b.right)), canvas.width);
    assert.equal(Math.max(...bounds.map((b) => b.bottom)), canvas.height);
    assert.equal(moved[1].item.x - moved[0].item.x, 250);
    const rotated = g.rotateLayoutGroup(moved, 90);
    assert.ok(rotated);
    for (const entry of rotated) {
      const b = g.layoutBounds(entry.item, entry.box);
      assert.ok(b.left >= -1e-6 && b.top >= -1e-6 && b.right <= canvas.width + 1e-6 && b.bottom <= canvas.height + 1e-6);
    }
  });
}
test("vertical positions beyond the horizontal height survive normalization", () => {
  const g = geometry("vertical");
  const layout = g.normalizeLayout({ mode: "custom", items: { score: { x: 100, y: 1750, scale: 1, angle: 0 } } });
  assert.equal(layout.items.score.y, 1750);
  assert.ok(g.layoutDefault("heartRate").x < 1080);
  assert.ok(g.layoutDefault("health").y > 280);
});

test("orientation switches restore independent appearances and preserve provider credentials", () => {
  const storage = new Map(), nodes = new Map();
  const context = vm.createContext({
    structuredClone,
    state: { settings: {
      orientation: "horizontal", layout: { mode: "custom", items: { score: { x: 1500, y: 800, scale: 1, angle: 0 } } },
      position: "bottom-right", accentColor: "#123456", dataSource: "bsplus",
      heartRate: { enabled: true, provider: "pulsoid", pulsoidToken: "keep-me", hyperateDeviceId: "device", port: 65302 },
    } },
    defaultSettings: { layout: { mode: "presets", items: {} }, position: "top-left", accentColor: "#f000dc", heartRate: { enabled: false } },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: (id) => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); } },
    renderSettings() {}, renderMap() {}, saveSettings() {}, setLayoutSelection() {},
  });
  vm.runInContext(source + "\n" + readFileSync(require.resolve("../canvas.js"), "utf8"), context);
  vm.runInContext('switchCanvasOrientation("vertical")', context);
  assert.equal(context.state.settings.orientation, "vertical");
  assert.equal(context.state.settings.layout.mode, "presets");
  assert.equal(context.state.settings.heartRate.pulsoidToken, "keep-me");
  assert.equal(context.state.settings.dataSource, "bsplus");
  context.state.settings.layout = { mode: "custom", items: { score: { x: 200, y: 1700, scale: 1, angle: 0 } } };
  context.state.settings.accentColor = "#abcdef";
  vm.runInContext('switchCanvasOrientation("horizontal")', context);
  assert.equal(context.state.settings.accentColor, "#123456");
  assert.equal(context.state.settings.layout.items.score.x, 1500);
  vm.runInContext('switchCanvasOrientation("vertical")', context);
  assert.equal(context.state.settings.accentColor, "#abcdef");
  assert.equal(context.state.settings.layout.items.score.y, 1700);
  for (const profile of storage.values()) assert.ok(!profile.includes("keep-me"));
});
