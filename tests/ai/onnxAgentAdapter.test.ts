import { test, expect } from "bun:test";
import { OnnxAgent } from "../../src/ai/onnxAgent";
import { MAX_ACTIONS } from "../../src/ai/actionEncoder";

// The adapter delegates to OnnxAgent.getAction. When inference has no loaded
// session it falls back to randomLegalAction over the mask — so we verify that
// with a single legal action, the fallback (or any correct implementation) is
// forced to that index.
test("OnnxAgent.getAction returns the only legal action when just one bit is set", async () => {
  const agent = new OnnxAgent();
  const obs = new Float32Array(2800);
  const mask = new Int8Array(MAX_ACTIONS);
  mask[7] = 1;
  const idx = await agent.getAction(obs, mask);
  expect(idx).toBe(7);
});

test("OnnxAgent.getAction picks a legal action when multiple bits are set (fallback path)", async () => {
  const agent = new OnnxAgent();
  const obs = new Float32Array(2800);
  const mask = new Int8Array(MAX_ACTIONS);
  mask[3] = 1;
  mask[11] = 1;
  mask[42] = 1;
  const idx = await agent.getAction(obs, mask);
  expect([3, 11, 42]).toContain(idx);
});
