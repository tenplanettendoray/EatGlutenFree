import assert from "node:assert/strict";
import test from "node:test";
import { loadTsModule } from "./load-ts-module.mjs";

const { globeViewport } = loadTsModule("app/lib/globe-viewport.ts");

test("phone overview fits in portrait, landscape and the keyboard's remaining space", () => {
  for (const [width, height] of [[320, 390], [375, 433], [390, 610], [430, 680], [480, 200], [390, 130]]) {
    const { fov, overviewDistance } = globeViewport(width, height, true);
    assert.ok(overviewDistance >= 2.2 && overviewDistance <= 7.6, "overview is reachable without clamping");
    const projectedDiameter = height * Math.tan(Math.asin(1.45 / overviewDistance)) / Math.tan(fov * Math.PI / 360);
    assert.ok(projectedDiameter < width && projectedDiameter < height, "whole globe remains visible");
    assert.ok(projectedDiameter >= Math.min(width, height) * .87, "globe uses the available space");
  }
});

test("keyboard and orientation resizing preserve apparent globe size at the same zoom", () => {
  const distance = 5.6;
  const relativeSizes = [[390, 600], [390, 200], [480, 240]].map(([width, height]) => {
    const { fov } = globeViewport(width, height, true);
    return height * Math.tan(Math.asin(1.45 / distance)) / Math.tan(fov * Math.PI / 360) / Math.min(width, height);
  });
  assert.ok(Math.max(...relativeSizes) - Math.min(...relativeSizes) < .00001);
});

test("a temporarily zero-sized mount produces finite framing", () => {
  const { fov, overviewDistance } = globeViewport(0, 0, true);
  assert.ok(Number.isFinite(fov) && Number.isFinite(overviewDistance));
});
