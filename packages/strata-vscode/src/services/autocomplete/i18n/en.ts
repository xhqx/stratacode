// English runtime translations for autocomplete (stratacode:autocomplete.* namespace)
// Source: src/i18n/locales/en/stratacode.json → "autocomplete" section

export const dict = {
  "stratacode:autocomplete.statusBar.enabled": "$(sparkle) Autocomplete",
  "stratacode:autocomplete.statusBar.snoozed": "snoozed",
  "stratacode:autocomplete.statusBar.warning": "$(warning) Autocomplete",
  "stratacode:autocomplete.statusBar.tooltip.basic": "Strata Code Autocomplete",
  "stratacode:autocomplete.statusBar.tooltip.disabled": "Strata Code Autocomplete (disabled)",
  "stratacode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**No autocomplete model configured**\n\nTo enable autocomplete, add a profile with one of these supported providers: {{providers}}.\n\n[Open Settings]({{command}})",
  "stratacode:autocomplete.statusBar.tooltip.sessionTotal": "Session total cost:",
  "stratacode:autocomplete.statusBar.tooltip.provider": "Provider:",
  "stratacode:autocomplete.statusBar.tooltip.model": "Model:",
  "stratacode:autocomplete.statusBar.tooltip.profile": "Profile: ",
  "stratacode:autocomplete.statusBar.tooltip.defaultProfile": "Default",
  "stratacode:autocomplete.statusBar.tooltip.completionSummary":
    "Performed {{count}} completions between {{startTime}} and {{endTime}}, for a total cost of {{cost}}.",
  "stratacode:autocomplete.statusBar.tooltip.providerInfo": "Autocompletions provided by {{model}} via {{provider}}.",
  "stratacode:autocomplete.statusBar.cost.zero": "$0.00",
  "stratacode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "stratacode:autocomplete.toggleMessage": "Strata Code Autocomplete {{status}}",
  "stratacode:autocomplete.progress.title": "Strata Code",
  "stratacode:autocomplete.progress.analyzing": "Analyzing your code...",
  "stratacode:autocomplete.progress.generating": "Generating suggested edits...",
  "stratacode:autocomplete.progress.processing": "Processing suggested edits...",
  "stratacode:autocomplete.progress.showing": "Displaying suggested edits...",
  "stratacode:autocomplete.input.title": "Strata Code: Quick Task",
  "stratacode:autocomplete.input.placeholder": "e.g., 'refactor this function to be more efficient'",
  "stratacode:autocomplete.commands.generateSuggestions": "Strata Code: Generate Suggested Edits",
  "stratacode:autocomplete.commands.displaySuggestions": "Display Suggested Edits",
  "stratacode:autocomplete.commands.cancelSuggestions": "Cancel Suggested Edits",
  "stratacode:autocomplete.commands.applyCurrentSuggestion": "Apply Current Suggested Edit",
  "stratacode:autocomplete.commands.applyAllSuggestions": "Apply All Suggested Edits",
  "stratacode:autocomplete.commands.category": "Strata Code",
  "stratacode:autocomplete.codeAction.title": "Strata Code: Suggested Edits",
  "stratacode:autocomplete.chatParticipant.fullName": "Strata Code Agent",
  "stratacode:autocomplete.chatParticipant.name": "Agent",
  "stratacode:autocomplete.chatParticipant.description": "I can help you with quick tasks and suggested edits.",
  "stratacode:autocomplete.incompatibilityExtensionPopup.message":
    "The Strata Code Autocomplete is being blocked by a conflict with GitHub Copilot. To fix this, you must disable Copilot's inline suggestions.",
  "stratacode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Disable Copilot",
  "stratacode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "Disable Autocomplete",
  "stratacode:autocomplete.creditsExhausted.message":
    "Strata Code Autocomplete has been paused because your account has no remaining credits. Add credits to resume autocomplete.",
  "stratacode:autocomplete.creditsExhausted.addCredits": "Add Credits",
  "stratacode:autocomplete.authError.message":
    "Strata Code Autocomplete has been paused due to an authentication error. Please sign in again.",
}
