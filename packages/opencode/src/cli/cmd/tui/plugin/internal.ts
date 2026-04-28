import HomeFooter from "../feature-plugins/home/footer"
import HomeTips from "../feature-plugins/home/tips"
// stratacode_change start
import HomeNews from "@/stratacode/plugins/home-news"
import HomeOnboarding from "@/stratacode/plugins/home-onboarding"
import StrataHomeFooter from "@/stratacode/plugins/home-footer"
import StrataSidebarFooter from "@/stratacode/plugins/sidebar-footer"
import StrataSidebarPr from "@/stratacode/plugins/sidebar-pr"
import StrataSidebarUsage from "@/stratacode/plugins/sidebar-usage"
// stratacode_change end
import SidebarContext from "../feature-plugins/sidebar/context"
import SidebarMcp from "../feature-plugins/sidebar/mcp"
import SidebarLsp from "../feature-plugins/sidebar/lsp"
import SidebarTodo from "../feature-plugins/sidebar/todo"
import SidebarFiles from "../feature-plugins/sidebar/files"
import SidebarFooter from "../feature-plugins/sidebar/footer"
import PluginManager from "../feature-plugins/system/plugins"
import type { TuiPlugin, TuiPluginModule } from "@stratacode/plugin/tui"

export type InternalTuiPlugin = TuiPluginModule & {
  id: string
  tui: TuiPlugin
}

export const INTERNAL_TUI_PLUGINS: InternalTuiPlugin[] = [
  HomeNews, // stratacode_change
  HomeOnboarding, // stratacode_change
  StrataHomeFooter, // stratacode_change
  StrataSidebarFooter, // stratacode_change
  StrataSidebarPr, // stratacode_change
  StrataSidebarUsage, // stratacode_change
  HomeFooter,
  HomeTips,
  SidebarContext,
  SidebarMcp,
  SidebarLsp,
  SidebarTodo,
  SidebarFiles,
  SidebarFooter,
  PluginManager,
]
