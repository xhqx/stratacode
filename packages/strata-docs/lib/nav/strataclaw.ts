import { NavSection } from "../types"

export const StrataClawNav: NavSection[] = [
  {
    title: "StrataClaw",
    links: [
      { href: "/strataclaw/overview", children: "Overview" },
      { href: "/strataclaw/dashboard", children: "Dashboard" },
      { href: "/strataclaw/pre-installed-software", children: "Pre-installed Software" },
      { href: "/strataclaw/end-to-end", children: "End to End Config" },
      {
        href: "/strataclaw/control-ui/overview",
        children: "Control UI",
        subLinks: [
          { href: "/strataclaw/control-ui/overview", children: "Overview" },
          { href: "/strataclaw/control-ui/changing-models", children: "Changing Models" },
          { href: "/strataclaw/control-ui/exec-approvals", children: "Exec Approvals" },
          { href: "/strataclaw/control-ui/version-pinning", children: "Version Pinning" },
        ],
      },
      {
        href: "/strataclaw/chat-platforms",
        children: "Chat Platforms",
        subLinks: [
          { href: "/strataclaw/chat-platforms", children: "Overview" },
          { href: "/strataclaw/chat-platforms/telegram", children: "Telegram" },
          { href: "/strataclaw/chat-platforms/discord", children: "Discord" },
          { href: "/strataclaw/chat-platforms/slack", children: "Slack" },
        ],
      },
      {
        href: "/strataclaw/development-tools",
        children: "Development Tools",
        subLinks: [
          { href: "/strataclaw/development-tools", children: "Overview" },
          { href: "/strataclaw/development-tools/github", children: "GitHub" },
          { href: "/strataclaw/development-tools/google", children: "Google Workspace" },
        ],
      },
      {
        href: "/strataclaw/triggers",
        children: "Triggers",
        subLinks: [
          { href: "/strataclaw/triggers", children: "Overview" },
          { href: "/strataclaw/triggers/webhooks", children: "Webhooks" },
          { href: "/strataclaw/triggers/scheduled", children: "Scheduled" },
        ],
      },
      {
        href: "/strataclaw/tools",
        children: "Tools",
        subLinks: [
          { href: "/strataclaw/tools", children: "Overview" },
          { href: "/strataclaw/tools/1password", children: "1Password" },
          { href: "/strataclaw/tools/brave-search", children: "Brave Search" },
          { href: "/strataclaw/tools/agentcard", children: "AgentCard" },
        ],
      },
      {
        href: "/strataclaw/troubleshooting/common-questions",
        children: "Troubleshooting",
        subLinks: [
          { href: "/strataclaw/troubleshooting/common-questions", children: "Common Questions" },
          { href: "/strataclaw/troubleshooting/gateway-process", children: "Gateway Process States" },
          { href: "/strataclaw/troubleshooting/architecture", children: "Architecture Notes" },
        ],
      },
      {
        href: "/strataclaw/faq/general",
        children: "FAQ",
        subLinks: [
          { href: "/strataclaw/faq/general", children: "General" },
          { href: "/strataclaw/faq/pricing", children: "Pricing" },
        ],
      },
    ],
  },
]
