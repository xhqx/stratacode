import type { Meta, StoryObj } from "storybook-solidjs"
import FeaturesTab from "../components/settings/FeaturesTab"
import Settings from "../components/settings/Settings"
import { StoryProviders } from "./StoryProviders"
import { FEATURES } from "../components/settings/feature-registry"
import type { ExtensionFeatureFlags } from "../types/messages/config"
import { PluginConfigProvider } from "../context/plugin-config"

const meta = {
  title: "Settings/Features",
  component: FeaturesTab,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FeaturesTab>

export default meta
type Story = StoryObj<typeof meta>

// Helper to make all flags false
const allOff = Object.fromEntries(FEATURES.map((f) => [f.key, false])) as Record<keyof ExtensionFeatureFlags, boolean>

// Helper to make all flags true
const allOn = Object.fromEntries(FEATURES.map((f) => [f.key, true])) as Record<keyof ExtensionFeatureFlags, boolean>

export const FeaturesAllOn: Story = {
  render: () => (
    <div style={{ height: "600px" }}>
      <StoryProviders config={{}} extensionFeatures={allOn}>
        <FeaturesTab />
      </StoryProviders>
    </div>
  ),
}

export const FeaturesDefault: Story = {
  render: () => (
    <div style={{ height: "600px" }}>
      <StoryProviders config={{}}>
        <FeaturesTab />
      </StoryProviders>
    </div>
  ),
}

export const FeaturesAllOff: Story = {
  render: () => (
    <div style={{ height: "600px" }}>
      <StoryProviders config={{}} extensionFeatures={allOff}>
        <FeaturesTab />
      </StoryProviders>
    </div>
  ),
}

export const FeaturesDeepLink: Story = {
  render: () => (
    <div style={{ height: "600px" }}>
      <StoryProviders config={{}}>
        <PluginConfigProvider>
          <Settings tab="features.autocomplete" />
        </PluginConfigProvider>
      </StoryProviders>
    </div>
  ),
}

export const FeaturesSettings: Story = {
  render: () => (
    <div style={{ height: "600px" }}>
      <StoryProviders config={{}}>
        <PluginConfigProvider>
          <Settings tab="features" />
        </PluginConfigProvider>
      </StoryProviders>
    </div>
  ),
}
