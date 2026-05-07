// stratacode_change - new file
import { Effect, Queue, Stream } from "effect"
import { Service as ACPManagerService } from "./manager"
import { ConfigACPProvider } from "./config"
import { Log } from "../../util"
import { type ClientSideConnection } from "@agentclientprotocol/sdk"


const log = Log.create({ service: "acp-language-model" })

export function createACPLanguageModel(
  acpManager: import("./manager").Interface,
  modelOpts: any,
): any {
  return {
    specificationVersion: "v1",
    provider: modelOpts.providerID,
    modelId: modelOpts.id,
    defaultObjectGenerationMode: "json",

    async doGenerate(options: any): Promise<any> {
      const config = modelOpts.options?.acpConfig as ConfigACPProvider
      const key = (modelOpts.options?.acpKey as string) ?? modelOpts.providerID

      // Start the connection
      const { conn, sessionId, events } = await Effect.runPromise(
        acpManager.getConnection(key, config)
      )

      if (modelOpts.api?.id && modelOpts.api.id !== "default") {
        await conn.unstable_setSessionModel({
          sessionId,
          modelId: modelOpts.api.id,
        })
      }

      // Format AI SDK prompt to ACP prompt
      const acpPrompt: { type: "text"; text: string }[] = []
      for (const msg of options.prompt) {
        if (msg.role === "system") {
          acpPrompt.push({ type: "text", text: `[System]\n${msg.content}` })
        } else if (msg.role === "user") {
          const text = Array.isArray(msg.content)
            ? msg.content.map((c: any) => c.text || "").join("\n")
            : msg.content
          acpPrompt.push({ type: "text", text })
        } else if (msg.role === "assistant") {
          const text = Array.isArray(msg.content)
            ? msg.content.map((c: any) => c.text || "").join("\n")
            : msg.content
          acpPrompt.push({ type: "text", text: `[Assistant]\n${text}` })
        }
      }

      const promptReq: Parameters<ClientSideConnection["prompt"]>[0] = {
        sessionId,
        prompt: acpPrompt,
      }

      let generatedText = ""

      const onSessionUpdate = (params: any) => {
        if (params.sessionId !== sessionId) return
        const update = params.update
        if (!update) return

        if (update.sessionUpdate === "agent_message_chunk") {
          const content = update.content
          if (content?.type === "text" && content.text) {
            generatedText += content.text
          }
        }
      }

      events.on("sessionUpdate", onSessionUpdate)

      try {
        await conn.prompt(promptReq)
      } catch (err) {
        log.error("doGenerate failed", { err })
        throw err
      } finally {
        events.off("sessionUpdate", onSessionUpdate)
      }

      return {
        text: generatedText,
        usage: { promptTokens: 0, completionTokens: 0 },
        finishReason: "stop",
      }
    },

    async doStream(options: any): Promise<any> {
      throw new Error("Stream is not supported for ACP models in AI SDK wrapper yet.")
    },
  }
}
