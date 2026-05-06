import type { Feature, FeatureContext } from "../feature"

export class BatchFeature implements Feature {
  readonly id = "batchTool" as const
  readonly configKeys = [] as const
  readonly messageTypes = [] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    await ctx.client?.global.config.update({ config: { experimental: { batch_tool: enabled } } })
  }

  onConfigChanged(): void {}
  handleMessage(): boolean {
    return false
  }
  pushState(): void {}
  dispose(): void {}
}
