import type { Feature, FeatureContext } from "../feature"

export class FormatterFeature implements Feature {
  readonly id = "formatter" as const
  readonly configKeys = [] as const
  readonly messageTypes = [] as const

  async onToggled(enabled: boolean, ctx: FeatureContext): Promise<void> {
    await ctx.client?.global.config.update({ config: { formatter: enabled ? {} : false } })
  }

  onConfigChanged(): void {}
  handleMessage(): boolean {
    return false
  }
  pushState(): void {}
  dispose(): void {}
}
