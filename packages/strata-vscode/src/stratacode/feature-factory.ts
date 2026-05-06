import type * as vscode from "vscode"
import type { Feature, FeatureContext } from "./feature"
import type { FeatureKey } from "./feature-defaults"

export class FeatureFactory implements vscode.Disposable {
  private features = new Map<FeatureKey, Feature>()
  private msgIndex = new Map<string, Feature>()
  private cfgIndex = new Map<string, Feature[]>()

  register(feature: Feature): void {
    this.features.set(feature.id, feature)

    for (const msgType of feature.messageTypes) {
      if (this.msgIndex.has(msgType)) {
        console.warn(`FeatureFactory: Message type '${msgType}' is already registered by another feature.`)
      }
      this.msgIndex.set(msgType, feature)
    }

    for (const configKey of feature.configKeys) {
      if (!this.cfgIndex.has(configKey)) {
        this.cfgIndex.set(configKey, [])
      }
      this.cfgIndex.get(configKey)!.push(feature)
    }
  }

  get(id: FeatureKey): Feature | undefined {
    return this.features.get(id)
  }

  async routeMessage(msg: Record<string, unknown>, ctx: FeatureContext): Promise<boolean> {
    if (typeof msg.type !== "string") return false
    const feature = this.msgIndex.get(msg.type)
    if (!feature) return false

    const consumed = await feature.handleMessage(msg, ctx)
    return consumed
  }

  routeConfig(e: vscode.ConfigurationChangeEvent, ctx: FeatureContext): void {
    for (const [key, features] of this.cfgIndex.entries()) {
      if (e.affectsConfiguration(key)) {
        for (const feature of features) {
          feature.onConfigChanged(e, ctx)
        }
      }
    }
  }

  async routeToggle(key: FeatureKey, enabled: boolean, ctx: FeatureContext): Promise<void> {
    const feature = this.get(key)
    if (feature) {
      await feature.onToggled(enabled, ctx)
    }
  }

  pushAll(ctx: FeatureContext): void {
    for (const feature of this.features.values()) {
      feature.pushState(ctx)
    }
  }

  dispose(): void {
    for (const feature of this.features.values()) {
      feature.dispose()
    }
    this.features.clear()
    this.msgIndex.clear()
    this.cfgIndex.clear()
  }
}
