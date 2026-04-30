// Strata-specific translations and overrides
// Keys here will override any matching keys from upstream translations
export const dict = {
  // Strata Gateway provider translations
  "provider.connect.strataGateway.line1":
    "Strata Gateway gives you access to a curated set of reliable optimized models for coding agents.",
  "provider.connect.strataGateway.line2":
    "With a single API key you'll get access to models such as Claude, GPT, Gemini, GLM and more.",
  "provider.connect.strataGateway.visit.prefix": "Visit ",
  "provider.connect.strataGateway.visit.link": "strata.ai",
  "provider.connect.strataGateway.visit.suffix": " to collect your API key.",

  // Provider dialog translations
  "dialog.provider.group.recommended": "Recommended",
  "dialog.provider.strata.note": "Access 500+ AI models",

  // Reasoning block label
  "ui.permission.run": "Run",
  "ui.reasoning.label": "Reasoning",

  // Marketplace
  "marketplace.tab.skills": "Skills",
  "marketplace.tab.mcpServers": "MCP Servers",
  "marketplace.tab.modes": "Modes",
  "marketplace.category.all": "All",
  "marketplace.placeholder": "To be implemented",
  "marketplace.card.installed": "Installed",
  "marketplace.card.install": "Install",
  "marketplace.card.remove": "Remove",
  "marketplace.card.removeScope": "Remove ({{scope}})",
  "marketplace.card.showMore": "Show more",
  "marketplace.card.showLess": "Show less",
  "marketplace.install.title": "Install {{name}}",
  "marketplace.install.scope": "Scope",
  "marketplace.install.scope.project": "Project",
  "marketplace.install.scope.global": "Global",
  "marketplace.install.prerequisites": "Prerequisites",
  "marketplace.install.installing": "Installing...",
  "marketplace.install.cancel": "Cancel",
  "marketplace.install.success": "Successfully installed!",
  "marketplace.install.failed": "Installation failed",
  "marketplace.install.done": "Done",
  "marketplace.install.close": "Close",
  "marketplace.remove.title": "Remove {{name}}?",
  "marketplace.remove.confirm":
    "Are you sure you want to remove this {{type}}? This will remove it from your {{scope}} configuration.",
  "marketplace.remove.cancel": "Cancel",
  "marketplace.remove.confirm.button": "Remove",
  "marketplace.tab.mcp": "MCP",
  "marketplace.search": "Search...",
  "marketplace.filter.all": "All Items",
  "marketplace.filter.notInstalled": "Not Installed",
  "marketplace.empty": "No items found",
  "marketplace.badge.mcpServer": "MCP Server",
  "marketplace.badge.mode": "Mode",
  "marketplace.card.by": "by {{author}}",
  "marketplace.install.method": "Installation Method",
  "marketplace.install.parameters": "Parameters",
  "marketplace.install.optional": "(optional)",
  "marketplace.install.required": "{{name}} is required",
  "marketplace.scope.project": "project",
  "marketplace.scope.global": "global",
  "marketplace.remove.type.mcp": "MCP server",
  "marketplace.remove.type.skill": "skill",
  "marketplace.remove.type.mode": "mode",
  "marketplace.remove.failed": "Failed to remove {{name}}",
  "marketplace.install": "Install",
  "marketplace.filter.installed": "Installed",
  "marketplace.error.dismiss": "Dismiss",
  "marketplace.warning.busyOne": "One session is running and will be interrupted",
  "marketplace.warning.busyMany": "Several sessions are running and will be interrupted",
  "marketplace.warning.installAnyway": "Install anyway",
  "marketplace.warning.cancel": "Cancel",
  "marketplace.contribute.prompt": "Missing a skill, mode, or MCP server?",
  "marketplace.contribute.cta": "Contribute on GitHub",

  // Plan follow-up question shown after plan_exit. The English strings here must match
  // the canonical `label`/`header`/`question` sent by the backend — those canonical labels
  // are still what the backend matches on (see packages/opencode/src/stratacode/plan-followup.ts).
  "plan.followup.header": "Implement",
  "plan.followup.question": "Ready to implement?",
  "plan.followup.answer.newSession": "Start new session",
  "plan.followup.answer.newSession.description": "Implement in a fresh session with a clean context",
  "plan.followup.answer.continue": "Continue here",
  "plan.followup.answer.continue.description": "Implement the plan in this session",
  "settings.agentBehaviour.importOpenCodeSettings": "Import settings from OpenCode",

  // Retry UI keys
  "settings.agentBehaviour.retry.title": "Resilience & Retries",
  "settings.agentBehaviour.retry.description":
    "Configure automatic retry logic and backoff delays when the agent experiences transient failures.",

  // Changed files panel
  "chat.changedFiles.title": "Changed Files",
  "chat.changedFiles.empty": "No files changed yet",
  "chat.changedFiles.summary": "{{count}} file changed",
  "chat.changedFiles.summary_other": "{{count}} files changed",
  "chat.changedFiles.openFile": "Open file",
  "settings.agentBehaviour.subtab.acpAgents": "ACP Agents",
  "settings.agentBehaviour.card.addAcp": "Add ACP agent",
  "settings.agentBehaviour.removeAcp.title": "Remove ACP agent?",
  "settings.agentBehaviour.removeAcp.confirm":
    "Are you sure you want to remove the '{{name}}' ACP agent configuration?",
  "settings.agentBehaviour.removeAcp.button": "Remove",

  "settings.agentBehaviour.acpBrowseMarketplace": "Browse Marketplace",
  "settings.agentBehaviour.acpEmpty": "No ACP agents configured. Add ACP agents in strata.jsonc.",
  "settings.agentBehaviour.editAcp": "Edit ACP Agent",
  "settings.agentBehaviour.editAcp.transportLocal": "Local stdio Transport",
  "settings.agentBehaviour.editAcp.transportRemote": "Remote HTTP Transport",
  "settings.agentBehaviour.addAcp.command": "Command",
  "settings.agentBehaviour.addAcp.command.placeholder": "e.g. npx",
  "settings.agentBehaviour.addAcp.args": "Arguments",
  "settings.agentBehaviour.addAcp.args.help": "Arguments passed to the command, one per line.",
  "settings.agentBehaviour.addAcp.args.placeholder": "e.g. -y\n@example/acp-agent",
  "settings.agentBehaviour.addAcp.url": "Server URL",
  "settings.agentBehaviour.addAcp.url.placeholder": "e.g. http://localhost:3000/sse",
  "settings.agentBehaviour.editAcp.env": "Environment Variables",
  "settings.agentBehaviour.editAcp.env.help": "Key-value pairs to pass to the agent process.",
  "settings.agentBehaviour.acpDetail.command": "Command",
  "settings.agentBehaviour.acpDetail.args": "Args",
  "settings.agentBehaviour.acpDetail.env": "Environment",
}
