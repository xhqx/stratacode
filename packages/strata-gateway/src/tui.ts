/**
 * Strata Gateway TUI Integration
 *
 * This module provides TUI-specific functionality for strata-gateway.
 * It requires OpenCode TUI dependencies to be injected at runtime.
 *
 * Import from "@stratacode/strata-gateway/tui" for TUI features.
 */

// ============================================================================
// TUI Dependency Injection
// ============================================================================
export { initializeTUIDependencies, getTUIDependencies, areTUIDependenciesInitialized } from "./tui/context.js"
export type { TUIDependencies } from "./tui/types.js"

// ============================================================================
// TUI Helpers
// ============================================================================
export { formatProfileInfo, getOrganizationOptions, getDefaultOrganizationSelection } from "./tui/helpers.js"

// ============================================================================
// NOTE: TUI Components Moved to OpenCode
// ============================================================================
// All TUI components with JSX have been moved to packages/opencode/src/stratacode/
// to ensure correct JSX transpilation with @opentui/solid.
//
// Components moved:
// - registerStrataCommands -> @/stratacode/strata-commands
// - DialogStrataTeamSelect -> @/stratacode/components/dialog-strata-team-select
// - DialogStrataOrganization -> @/stratacode/components/dialog-strata-organization
// - DialogStrataProfile -> @/stratacode/components/dialog-strata-profile
// - StrataAutoMethod -> @/stratacode/components/dialog-strata-auto-method
// - StrataNews -> @/stratacode/components/strata-news
// - NotificationBanner -> @/stratacode/components/notification-banner
// - DialogStrataNotifications -> @/stratacode/components/dialog-strata-notifications
