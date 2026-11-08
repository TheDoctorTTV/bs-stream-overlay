const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({});
vm.runInContext(
  readFileSync(require.resolve("../layout.js"), "utf8") +
    "\nthis.geometry = {layoutBounds, constrainLayoutItem, snapLayoutItem, resizeHealthWidth, normalizeLayout, layoutGroupBounds, moveLayoutGroup, rotateLayoutGroup, createLayoutHistory, layoutElementVisible};",
  context,
);
const { layoutBounds, constrainLayoutItem, snapLayoutItem } = context.geometry;
const box = { width: 126, height: 126 };
const item = (x, y, angle = 0, scale = 1) => ({ x, y, angle, scale });
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("all four boundaries contain rotated and oversized elements", () => {
  for (const angle of [-180, -135, -90, -45, 0, 30, 90, 135, 180]) {
    for (const [x, y] of [
      [-200, -200],
      [1900, 1050],
      [800, 400],
    ]) {
      const value = item(x, y, angle, 5);
      const size = { width: 720, height: 126 };
      constrainLayoutItem(value, size);
      const b = layoutBounds(value, size);
      assert.ok(
        b.left >= -1e-6 &&
          b.top >= -1e-6 &&
          b.right <= 1920 + 1e-6 &&
          b.bottom <= 1080 + 1e-6,
      );
    }
  }
});
test("snaps both leading and trailing edges of the full box", () => {
  const leading = snapLayoutItem(item(8, 8), box, [], 0.5);
  close(leading.item.x, 0);
  close(leading.item.y, 0);
  const trailing = snapLayoutItem(item(1786, 946), box, [], 0.5);
  close(trailing.item.x, 1794);
  close(trailing.item.y, 954);
  close(trailing.guides.x, 1920);
  close(trailing.guides.y, 1080);
});
test("snaps centers and nearby element edges with screen-space tolerance", () => {
  const centered = snapLayoutItem(item(900, 480), box, [], 1);
  close(centered.item.x, 897);
  close(centered.item.y, 477);
  const target = layoutBounds(item(400, 300), box);
  const near = snapLayoutItem(item(535, 300), box, [target], 0.5);
  close(near.item.x, 526);
  const far = snapLayoutItem(item(535, 300), box, [target], 1);
  close(far.item.x, 535);
});
test("ignores distant elements and does not mutate candidate transforms", () => {
  const original = item(535, 800);
  const result = snapLayoutItem(
    original,
    box,
    [layoutBounds(item(400, 100), box)],
    1,
  );
  close(result.item.x, original.x);
  close(original.x, 535);
});
test("rotated edges snap without crossing the canvas", () => {
  const original = item(35, 200, 45);
  const result = snapLayoutItem(original, box, [], 0.5);
  close(layoutBounds(result.item, box).left, 0);
});

test("health side resizing preserves scale, center and vertical dimensions", () => {
  const { resizeHealthWidth } = context.geometry;
  const start = { ...item(400, 300, 0, 1.5), width: 720 };
  const box = { width: 720, height: 32 };
  const result = resizeHealthWidth(start, box, "e", 75, 40);
  close(result.width, 820);
  close(result.scale, start.scale);
  close(result.y, start.y);
  close(
    result.x + (result.width * result.scale) / 2,
    start.x + (720 * start.scale) / 2,
  );
});
test("health width resizing follows the rotated horizontal axis", () => {
  const { resizeHealthWidth } = context.geometry;
  const start = { ...item(400, 300, 90), width: 720 };
  const box = { width: 720, height: 32 };
  close(resizeHealthWidth(start, box, "e", 100, 0).width, 720);
  close(resizeHealthWidth(start, box, "e", 0, 50).width, 820);
  close(resizeHealthWidth(start, box, "w", 0, 50).width, 620);
  const result = resizeHealthWidth(start, box, "e", 0, 10000);
  const bounds = layoutBounds(result, { ...box, width: result.width });
  assert.ok(bounds.bottom - bounds.top <= 1080 + 1e-6);
  close(result.scale, 1);
});
test("health widths survive URL normalization and older layouts use the default", () => {
  const { normalizeLayout } = context.geometry;
  const layout = normalizeLayout(
    JSON.stringify({
      mode: "custom",
      items: { health: { ...item(40, 280), width: 480 } },
    }),
  );
  close(layout.items.health.width, 480);
  close(
    normalizeLayout({ items: { health: item(40, 280) } }).items.health.width,
    720,
  );
});

test("group movement preserves relative spacing at every canvas edge", () => {
  const { moveLayoutGroup, layoutGroupBounds } = context.geometry;
  const entries = [
    {
      key: "a",
      item: item(100, 200, 20, 1.2),
      box: { width: 120, height: 60 },
    },
    {
      key: "b",
      item: item(400, 400, -40, 0.8),
      box: { width: 200, height: 90 },
    },
  ];
  for (const [dx, dy] of [
    [-5000, -5000],
    [5000, 5000],
    [75, -50],
  ]) {
    const result = moveLayoutGroup(entries, dx, dy),
      bounds = layoutGroupBounds(result);
    close(result[1].item.x - result[0].item.x, 300);
    close(result[1].item.y - result[0].item.y, 200);
    close(result[0].item.scale, 1.2);
    assert.ok(
      bounds.left >= -1e-6 &&
        bounds.top >= -1e-6 &&
        bounds.right <= 1920 + 1e-6 &&
        bounds.bottom <= 1080 + 1e-6,
    );
  }
});
test("group rotation rotates individual centers and angles around a shared pivot", () => {
  const { rotateLayoutGroup, layoutGroupBounds } = context.geometry;
  const entries = [
    {
      key: "a",
      item: item(500, 300, 15, 1.2),
      box: { width: 120, height: 60 },
    },
    {
      key: "b",
      item: item(900, 400, -25, 0.8),
      box: { width: 200, height: 90 },
    },
  ];
  const pivot = layoutGroupBounds(entries),
    rotated = rotateLayoutGroup(entries, 90);
  for (let i = 0; i < 2; i++) {
    const before = layoutBounds(entries[i].item, entries[i].box),
      after = layoutBounds(rotated[i].item, rotated[i].box);
    close(after.cx, pivot.cx - (before.cy - pivot.cy));
    close(after.cy, pivot.cy + (before.cx - pivot.cx));
    close(rotated[i].item.angle, entries[i].item.angle + 90);
    close(rotated[i].item.scale, entries[i].item.scale);
  }
});
test("rotation rejects groups that cannot fit without changing element scales", () => {
  const { rotateLayoutGroup } = context.geometry;
  const entries = [
    { key: "a", item: item(20, 400), box: { width: 100, height: 40 } },
    { key: "b", item: item(1750, 400), box: { width: 100, height: 40 } },
  ];
  assert.equal(rotateLayoutGroup(entries, 90), null);
  close(entries[0].item.angle, 0);
});

test("undo and redo traverse committed edits and drop an abandoned redo branch", () => {
  const history = context.geometry.createLayoutHistory();
  for (const value of ["initial", "moved", "rotated"])
    history.push(value, value);
  assert.equal(history.undo(), "moved");
  assert.equal(history.redo(), "rotated");
  assert.equal(history.undo(), "moved");
  history.push("resized", "resized");
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), null);
  assert.equal(history.undo(), "moved");
  assert.equal(history.undo(), "initial");
  assert.equal(history.undo(), null);
  assert.equal(history.canUndo, false);
});
test("no-op commits preserve redo and do not consume undo steps", () => {
  const history = context.geometry.createLayoutHistory();
  history.push("initial", "a");
  history.push("moved", "b");
  history.undo();
  history.push("initial with new selection", "a");
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo(), "moved");
  assert.equal(history.undo(), "initial with new selection");
});
test("undo history enforces its edit limit", () => {
  const history = context.geometry.createLayoutHistory(2);
  for (const value of ["a", "b", "c", "d"]) history.push(value, value);
  assert.equal(history.undo(), "c");
  assert.equal(history.undo(), "b");
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), "c");
  assert.equal(history.redo(), "d");
});

test("enabled placeholders remain eligible for marquee, group selection and snapping", () => {
  const { layoutElementVisible } = context.geometry;
  const record = {
    wrapper: { hidden: false },
    element: { hidden: true, classList: { contains: () => false } },
  };
  assert.equal(layoutElementVisible(record), true);
  record.element.hidden = false;
  assert.equal(layoutElementVisible(record), true);
  record.wrapper.hidden = true;
  assert.equal(layoutElementVisible(record), false);
  record.wrapper.hidden = false;
  record.element.classList.contains = (key) => key === "is-hidden";
  assert.equal(layoutElementVisible(record), false);
});
