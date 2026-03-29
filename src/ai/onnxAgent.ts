/**
 * ONNX model inference agent for Startup Simulator.
 * Loads an ONNX model and runs inference to select actions.
 */

import * as ort from "onnxruntime-web";

import { OBS_SIZE } from "./observation";
import { MAX_ACTIONS } from "./actionEncoder";

export class OnnxAgent {
  private session: ort.InferenceSession | null = null;

  /**
   * Load an ONNX model from the given path (URL or local file path).
   */
  async load(modelPath: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelPath);
  }

  /**
   * Run inference and return the index of the best legal action.
   *
   * Model inputs:
   *   - 'observation': Float32 tensor shape [1, 2800]
   *   - 'action_mask': Float32 tensor shape [1, 512]
   *
   * Model outputs:
   *   - 'logits': Float32 tensor shape [1, 512]
   *
   * Picks the action with the highest logit among legal actions (argmax).
   * Falls back to a random legal action if ONNX inference fails.
   */
  async getAction(
    observation: Float32Array,
    actionMask: Int8Array,
  ): Promise<number> {
    // Convert Int8 mask to Float32 for ONNX
    const maskFloat = new Float32Array(MAX_ACTIONS);
    for (let i = 0; i < MAX_ACTIONS; i++) {
      maskFloat[i] = actionMask[i];
    }

    try {
      if (!this.session) {
        throw new Error("ONNX session not loaded");
      }

      const obsTensor = new ort.Tensor("float32", observation, [1, OBS_SIZE]);
      const maskTensor = new ort.Tensor("float32", maskFloat, [1, MAX_ACTIONS]);

      const results = await this.session.run({
        observation: obsTensor,
        action_mask: maskTensor,
      });

      const logits = results["logits"].data as Float32Array;

      // Argmax over legal actions only
      return argmaxMasked(logits, actionMask);
    } catch (err) {
      console.warn("ONNX inference failed, falling back to random legal action:", err);
      return randomLegalAction(actionMask);
    }
  }

  /** Whether a model is currently loaded. */
  get isLoaded(): boolean {
    return this.session !== null;
  }
}

/**
 * Return the index of the highest value in `logits` among positions
 * where `mask[i] === 1`. Returns -1 if no legal actions exist.
 */
function argmaxMasked(logits: Float32Array, mask: Int8Array): number {
  let bestIdx = -1;
  let bestVal = -Infinity;

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && logits[i] > bestVal) {
      bestVal = logits[i];
      bestIdx = i;
    }
  }

  if (bestIdx < 0) {
    console.warn("No legal actions in mask, returning 0");
    return 0;
  }
  return bestIdx;
}

/**
 * Pick a random legal action index from the mask.
 */
function randomLegalAction(mask: Int8Array): number {
  const legal: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) legal.push(i);
  }
  if (legal.length === 0) {
    console.warn("No legal actions for random fallback, returning 0");
    return 0;
  }
  return legal[Math.floor(Math.random() * legal.length)];
}
