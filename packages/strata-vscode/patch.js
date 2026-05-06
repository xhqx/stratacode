const fs = require('fs');
const file = 'webview-ui/src/types/messages/extension-messages.ts';
let content = fs.readFileSync(file, 'utf8');

const newInterface = `
export interface AcpProviderMeta {
  name: string
  description?: string
  icon?: string
  defaultModel?: string
  enabled: boolean
  configuredModel?: string
  status: "connected" | "disconnected" | "error"
  staticModels?: string[]
  liveModels?: string[]
  env?: string[]
  installed: boolean
}

export interface AcpProviderMetaMessage {
  type: "acpProviderMeta"
  providers: Record<string, AcpProviderMeta>
}

export interface ScenariosLoadedMessage {
`;
content = content.replace('export interface ScenariosLoadedMessage {', newInterface);

const newUnion = `  | AppendChatBoxMessage
  | AcpProviderMetaMessage
`;
content = content.replace('  | AppendChatBoxMessage', newUnion);

fs.writeFileSync(file, content);
