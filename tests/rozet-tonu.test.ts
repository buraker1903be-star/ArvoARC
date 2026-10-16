import { test } from "node:test";
import assert from "node:assert/strict";
import { rozetTonu } from "@/lib/rozet-tonu";

test("eski etiket tonları ArvoOS rozet tonlarına çevrilir", () => {
  assert.equal(rozetTonu("bad"), "danger");
  assert.equal(rozetTonu("warn"), "warning");
  assert.equal(rozetTonu("good"), "success");
  assert.equal(rozetTonu("muted"), "neutral");
  assert.equal(rozetTonu(undefined), "neutral");
  assert.equal(rozetTonu("bilinmeyen"), "neutral");
});
