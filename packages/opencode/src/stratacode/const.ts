import { InstallationVersion } from "@/installation/version"

export const DEFAULT_HEADERS = {
  "HTTP-Referer": "https://stratacode.ai",
  "X-Title": "Strata Code",
  "User-Agent": `Strata-Code/${InstallationVersion}`,
}
