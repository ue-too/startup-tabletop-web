import type { Agent, AgentContext } from "./agent";
import { OnnxAgent } from "./onnxAgent";

export class OnnxAgentAdapter implements Agent {
  private readonly inner = new OnnxAgent();

  constructor(private readonly modelPath: string) {}

  async init(): Promise<void> {
    await this.inner.load(this.modelPath);
  }

  async getAction(ctx: AgentContext): Promise<number> {
    if (!ctx.observation || !ctx.actionMask) {
      throw new Error(
        "OnnxAgentAdapter requires ctx.observation and ctx.actionMask",
      );
    }
    return this.inner.getAction(ctx.observation, ctx.actionMask);
  }

  get modelPathRef(): string {
    return this.modelPath;
  }
}
