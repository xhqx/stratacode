import type { Feature, FeatureContext } from "../feature"

export class RetriesFeature implements Feature {
  readonly id = "autoretries" as const
  readonly configKeys = [] as const
  readonly messageTypes = [] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    await ctx.client?.global.config.update({ config: { retry: { enabled } } })
  }

  onConfigChanged(): void {}
  handleMessage(): boolean {
    return false
  }
  pushState(): void {}
  dispose(): void {}
}
