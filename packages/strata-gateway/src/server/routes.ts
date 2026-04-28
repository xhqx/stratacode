/**
 * Strata Gateway specific routes
 * Handles profile fetching and organization management for Strata Gateway provider
 *
 * This factory function accepts OpenCode dependencies to create Strata-specific routes
 */

import { fetchProfile, fetchBalance } from "../api/profile.js"
import { fetchStratacodeNotifications, StratacodeNotificationSchema } from "../api/notifications.js"
import { fetchOrganizationModes, clearModesCache } from "../api/modes.js"
import { STRATA_API_BASE, HEADER_FEATURE, HEADER_ORGANIZATIONID } from "../api/constants.js"
import { buildStrataHeaders } from "../headers.js"
import type { ImportDeps, DrizzleDb } from "../cloud-sessions.js"
import { fetchCloudSession, fetchCloudSessionForImport, importSessionToDb } from "../cloud-sessions.js"

// Type definitions for OpenCode dependencies (injected at runtime)
type Hono = any
type DescribeRoute = any
type Validator = any
type Resolver = any
type Errors = any
type Auth = any
type ModelCache = { clear: (providerID: string) => void }
type Z = any

interface StrataRoutesDeps extends ImportDeps {
  Hono: new () => Hono
  describeRoute: DescribeRoute
  validator: Validator
  resolver: Resolver
  errors: Errors
  Auth: Auth
  ModelCache: ModelCache
  z: Z
  Instance: ImportDeps["Instance"] & { disposeAll(): Promise<void> }
}

const FIM_TIMEOUT_MS = 30_000

/**
 * Create Strata Gateway routes with OpenCode dependencies injected
 *
 * @example
 * ```typescript
 * import { createStrataRoutes } from "@stratacode/strata-gateway"
 * import { Hono } from "hono"
 * import { describeRoute, validator, resolver } from "hono-openapi"
 * import z from "zod"
 * import { errors } from "../error"
 * import { Auth } from "../../auth"
 *
 * export const StrataRoutes = createStrataRoutes({
 *   Hono,
 *   describeRoute,
 *   validator,
 *   resolver,
 *   errors,
 *   Auth,
 *   z,
 * })
 * ```
 */
export function createStrataRoutes(deps: StrataRoutesDeps) {
  const {
    Hono,
    describeRoute,
    validator,
    resolver,
    errors,
    Auth,
    z,
    Database,
    Instance,
    SessionTable,
    MessageTable,
    PartTable,
    SessionToRow,
    Bus,
    SessionCreatedEvent,
    Identifier,
    ModelCache,
  } = deps

  const Organization = z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
  })

  const Profile = z.object({
    email: z.string(),
    name: z.string().optional(),
    organizations: z.array(Organization).optional(),
  })

  const Balance = z.object({
    balance: z.number(),
  })

  const ProfileWithBalance = z.object({
    profile: Profile,
    balance: Balance.nullable(),
    currentOrgId: z.string().nullable(),
  })

  const FimStreamChunk = z.object({
    choices: z
      .array(
        z.object({
          delta: z
            .object({
              content: z.string().optional(),
            })
            .optional(),
          text: z.string().optional(), // Text-completion style streaming (Mercury)
        }),
      )
      .optional(),
    usage: z
      .object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
      })
      .optional(),
    cost: z.number().optional(),
  })

  return new Hono()
    .get(
      "/profile",
      describeRoute({
        summary: "Get Strata Gateway profile",
        description: "Fetch user profile and organizations from Strata Gateway",
        operationId: "strata.profile",
        responses: {
          200: {
            description: "Profile data",
            content: {
              "application/json": {
                schema: resolver(ProfileWithBalance),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      async (c: any) => {
        // Get Strata auth
        const auth = await Auth.get("strata")

        if (!auth || auth.type !== "oauth") {
          return c.json({ error: "Not authenticated with Strata Gateway" }, 401)
        }

        const token = auth.access
        const currentOrgId = auth.accountId ?? null

        // Fetch profile and balance in parallel
        // Pass organizationId to fetchBalance to get team balance when in org context
        const [profile, balance] = await Promise.all([
          fetchProfile(token),
          fetchBalance(token, currentOrgId ?? undefined),
        ])

        return c.json({ profile, balance, currentOrgId })
      },
    )
    .post(
      "/organization",
      describeRoute({
        summary: "Update Strata Gateway organization",
        description: "Switch to a different Strata Gateway organization",
        operationId: "strata.organization.set",
        responses: {
          200: {
            description: "Organization updated successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "json",
        z.object({
          organizationId: z.string().nullable(),
        }),
      ),
      async (c: any) => {
        const { organizationId } = c.req.valid("json")

        // Get current Strata auth
        const auth = await Auth.get("strata")

        if (!auth || auth.type !== "oauth") {
          return c.json({ error: "Not authenticated with Strata Gateway" }, 401)
        }

        // Update auth with new organization ID
        await Auth.set("strata", {
          type: "oauth",
          refresh: auth.refresh,
          access: auth.access,
          expires: auth.expires,
          ...(organizationId && { accountId: organizationId }),
        })

        ModelCache.clear("strata")
        clearModesCache()
        await Instance.disposeAll()

        return c.json(true)
      },
    )
    .get(
      "/modes",
      describeRoute({
        summary: "Get organization custom modes",
        description: "Fetch custom modes defined for the current organization",
        operationId: "strata.modes",
        responses: {
          200: {
            description: "Organization modes list",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    modes: z.array(
                      z.object({
                        id: z.string(),
                        organization_id: z.string(),
                        name: z.string(),
                        slug: z.string(),
                        created_by: z.string(),
                        created_at: z.string(),
                        updated_at: z.string(),
                        config: z.object({
                          roleDefinition: z.string().optional(),
                          whenToUse: z.string().optional(),
                          description: z.string().optional(),
                          customInstructions: z.string().optional(),
                          groups: z
                            .array(
                              z.union([
                                z.string(),
                                z.tuple([
                                  z.string(),
                                  z.object({ fileRegex: z.string().optional(), description: z.string().optional() }),
                                ]),
                              ]),
                            )
                            .optional(),
                        }),
                      }),
                    ),
                  }),
                ),
              },
            },
          },
        },
      }),
      async (c: any) => {
        const auth = await Auth.get("strata")

        if (!auth || auth.type !== "oauth") {
          return c.json({ modes: [] })
        }

        const token = auth.access
        if (!token) {
          return c.json({ modes: [] })
        }

        const orgId = auth.accountId
        if (!orgId) {
          return c.json({ modes: [] })
        }

        try {
          const modes = await fetchOrganizationModes(token, orgId)
          return c.json({ modes })
        } catch {
          return c.json({ modes: [] })
        }
      },
    )
    .post(
      "/fim",
      describeRoute({
        summary: "FIM completion",
        description: "Proxy a Fill-in-the-Middle completion request to the Strata Gateway",
        operationId: "strata.fim",
        responses: {
          200: {
            description: "Streaming FIM completion response",
            content: {
              "text/event-stream": {
                schema: resolver(FimStreamChunk),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "json",
        z.object({
          prefix: z.string(),
          suffix: z.string(),
          model: z.string().optional(),
          maxTokens: z.number().optional(),
          temperature: z.number().optional(),
        }),
      ),
      async (c: any) => {
        const auth = await Auth.get("strata")

        if (!auth) {
          return c.json({ error: "Not authenticated with Strata Gateway" }, 401)
        }

        const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
        if (!token) {
          return c.json({ error: "No valid token found" }, 401)
        }

        const organizationId = auth.type === "oauth" ? auth.accountId : undefined

        const { prefix, suffix, model, maxTokens, temperature } = c.req.valid("json")
        const fimModel = model ?? "mistralai/codestral-2501"
        const fimMaxTokens = maxTokens ?? 256
        const fimTemperature = temperature ?? 0.2

        const baseApiUrl = STRATA_API_BASE + "/api/"
        const endpoint = new URL("fim/completions", baseApiUrl)

        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...buildStrataHeaders(undefined, { stratacodeOrganizationId: organizationId }),
          [HEADER_FEATURE]: "autocomplete",
        }

        const signal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(FIM_TIMEOUT_MS)])

        let response: Response
        try {
          response = await fetch(endpoint, {
            method: "POST",
            headers,
            signal,
            body: JSON.stringify({
              model: fimModel,
              prompt: prefix,
              suffix,
              max_tokens: fimMaxTokens,
              temperature: fimTemperature,
              stream: true,
            }),
          })
        } catch (err) {
          if (err instanceof DOMException && err.name === "TimeoutError")
            return c.json({ error: "FIM request timed out" }, 504 as any)
          if (signal.aborted) return c.json({ error: "FIM request canceled" }, 499 as any)
          throw err
        }

        if (!response.ok) {
          const text = await response.text()
          return c.json({ error: `FIM request failed: ${response.status} ${text}` }, response.status as any)
        }

        return new Response(response.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        })
      },
    )
    .get(
      "/notifications",
      describeRoute({
        summary: "Get Strata notifications",
        description: "Fetch notifications from Strata Gateway for CLI display",
        operationId: "strata.notifications",
        responses: {
          200: {
            description: "Notifications list",
            content: {
              "application/json": {
                schema: resolver(z.array(StratacodeNotificationSchema)),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      async (c: any) => {
        const auth = await Auth.get("strata")
        if (!auth) return c.json([])

        const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
        if (!token) return c.json([])

        const organizationId = auth.type === "oauth" ? auth.accountId : undefined
        const notifications = await fetchStratacodeNotifications({
          stratacodeToken: token,
          stratacodeOrganizationId: organizationId,
        })

        return c.json(notifications)
      },
    )
    .get(
      "/cloud/session/:id",
      describeRoute({
        summary: "Get cloud session",
        description: "Fetch full session data from the Strata cloud for preview",
        operationId: "strata.cloud.session.get",
        responses: {
          200: {
            description: "Cloud session data",
            content: {
              "application/json": {
                schema: resolver(z.unknown()),
              },
            },
          },
          ...errors(401, 404),
        },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c: any) => {
        try {
          const auth = await Auth.get("strata")
          if (!auth) return c.json({ error: "Not authenticated with Strata Gateway" }, 401)
          const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
          if (!token) return c.json({ error: "No valid token found" }, 401)

          const { id } = c.req.valid("param")
          const result = await fetchCloudSession(token, id)
          if (!result.ok) return c.json({ error: result.error }, result.status)
          return c.json(result.data)
        } catch (err: any) {
          console.error("[Strata Gateway] cloud/session/get: unhandled error", err?.message ?? err)
          return c.json({ error: "Internal error" }, 500)
        }
      },
    )
    .post(
      "/cloud/session/import",
      describeRoute({
        summary: "Import session from cloud",
        description: "Download a cloud-synced session and write it to local storage with fresh IDs.",
        operationId: "strata.cloud.session.import",
        responses: {
          200: {
            description: "Imported session info",
            content: {
              "application/json": {
                schema: resolver(z.unknown()),
              },
            },
          },
          ...errors(400, 401, 404),
        },
      }),
      validator(
        "json",
        z.object({
          sessionId: z.string(),
        }),
      ),
      async (c: any) => {
        try {
          const { sessionId } = c.req.valid("json")

          const auth = await Auth.get("strata")
          if (!auth) return c.json({ error: "Not authenticated with Strata" }, 401)
          const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
          if (!token) return c.json({ error: "No valid token found" }, 401)

          const fetched = await fetchCloudSessionForImport(token, sessionId)
          if (!fetched.ok) return c.json({ error: fetched.error }, fetched.status as any)

          const data = fetched.data
          if (!data?.info?.id) return c.json({ error: "Invalid export data" }, 400)

          const info = importSessionToDb(data, {
            Database,
            Instance,
            SessionTable,
            MessageTable,
            PartTable,
            SessionToRow,
            Bus,
            SessionCreatedEvent,
            Identifier,
          })

          return c.json(info)
        } catch (err: any) {
          console.error("[Strata Gateway] cloud/session/import: unhandled error", err?.message ?? err)
          return c.json({ error: "Internal error" }, 500)
        }
      },
    )
    .get(
      "/claw/status",
      describeRoute({
        summary: "Get StrataClaw instance status",
        description: "Fetch the user's StrataClaw instance status via the StrataClaw worker",
        operationId: "strata.claw.status",
        responses: {
          200: {
            description: "Instance status",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    status: z
                      .enum(["provisioned", "starting", "restarting", "running", "stopped", "destroying"])
                      .nullable(),
                    sandboxId: z.string().optional(),
                    flyRegion: z.string().optional(),
                    machineSize: z.object({ cpus: z.number(), memory_mb: z.number() }).optional(),
                    openclawVersion: z.string().nullable().optional(),
                    lastStartedAt: z.string().nullable().optional(),
                    lastStoppedAt: z.string().nullable().optional(),
                    channelCount: z.number().optional(),
                    secretCount: z.number().optional(),
                    userId: z.string().optional(),
                  }),
                ),
              },
            },
          },
          ...errors(401, 502),
        },
      }),
      async (c: any) => {
        try {
          const auth = await Auth.get("strata")
          if (!auth) return c.json({ error: "Not authenticated with Strata Gateway" }, 401)
          const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
          if (!token) return c.json({ error: "No valid token found" }, 401)

          const organizationId = auth.type === "oauth" ? auth.accountId : undefined
          const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          }
          if (organizationId) {
            headers[HEADER_ORGANIZATIONID] = organizationId
          }

          const response = await fetch(`${STRATA_API_BASE}/api/strataclaw/status`, { headers })

          if (!response.ok) {
            const text = await response.text()
            return c.json({ error: `StrataClaw request failed: ${response.status} ${text}` }, response.status as any)
          }

          return c.json(await response.json())
        } catch (err: any) {
          console.error("[Strata Gateway] claw/status: error", err?.message ?? err)
          return c.json({ error: "Failed to reach StrataClaw" }, 502)
        }
      },
    )
    .get(
      "/claw/chat-credentials",
      describeRoute({
        summary: "Get StrataClaw chat credentials",
        description: "Fetch Stream Chat credentials for the user's StrataClaw instance",
        operationId: "strata.claw.chatCredentials",
        responses: {
          200: {
            description: "Stream Chat credentials or null",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .object({
                      apiKey: z.string(),
                      userId: z.string(),
                      userToken: z.string(),
                      channelId: z.string(),
                    })
                    .nullable(),
                ),
              },
            },
          },
          ...errors(401, 502),
        },
      }),
      async (c: any) => {
        try {
          const auth = await Auth.get("strata")
          if (!auth) return c.json({ error: "Not authenticated with Strata Gateway" }, 401)
          const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
          if (!token) return c.json({ error: "No valid token found" }, 401)

          const organizationId = auth.type === "oauth" ? auth.accountId : undefined
          const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          }
          if (organizationId) {
            headers[HEADER_ORGANIZATIONID] = organizationId
          }

          const response = await fetch(`${STRATA_API_BASE}/api/strataclaw/chat-credentials`, { headers })

          if (!response.ok) {
            const text = await response.text()
            return c.json({ error: `StrataClaw request failed: ${response.status} ${text}` }, response.status as any)
          }

          return c.json(await response.json())
        } catch (err: any) {
          console.error("[Strata Gateway] claw/chat-credentials: error", err?.message ?? err)
          return c.json({ error: "Failed to reach StrataClaw" }, 502)
        }
      },
    )
    .get(
      "/cloud-sessions",
      describeRoute({
        summary: "Get cloud sessions",
        description: "Fetch cloud CLI sessions from Strata API",
        operationId: "strata.cloudSessions",
        responses: {
          200: {
            description: "Cloud sessions list",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    cliSessions: z.array(
                      z.object({
                        session_id: z.string(),
                        title: z.string().nullable(),
                        created_at: z.string(),
                        updated_at: z.string(),
                        version: z.number(),
                      }),
                    ),
                    nextCursor: z.string().nullable(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "query",
        z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().optional(),
          gitUrl: z.string().optional(),
        }),
      ),
      async (c: any) => {
        try {
          const auth = await Auth.get("strata")
          if (!auth) return c.json({ error: "Not authenticated with Strata Gateway" }, 401)

          const token = auth.type === "api" ? auth.key : auth.type === "oauth" ? auth.access : undefined
          if (!token) return c.json({ error: "No valid token found" }, 401)

          const { cursor, limit, gitUrl } = c.req.valid("query")

          const input: Record<string, unknown> = {}
          if (cursor) input.cursor = cursor
          if (limit) input.limit = limit
          if (gitUrl) input.gitUrl = gitUrl

          const params = new URLSearchParams({
            batch: "1",
            input: JSON.stringify({ "0": input }),
          })

          const url = `${STRATA_API_BASE}/api/trpc/cliSessionsV2.list?${params.toString()}`

          const response = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...buildStrataHeaders(),
            },
          })

          if (!response.ok) {
            const text = await response.text()
            console.error("[Strata Gateway] cloud-sessions: tRPC request failed", {
              status: response.status,
              body: text.slice(0, 500),
            })
            return c.json({ error: `Cloud sessions fetch failed: ${response.status}` }, response.status as any)
          }

          const raw = await response.text()
          const json = JSON.parse(raw)
          const data = Array.isArray(json) ? json[0]?.result?.data : null
          const result = data?.json ?? data
          if (!result) return c.json({ cliSessions: [], nextCursor: null })

          const sessions = (result.cliSessions ?? []).map((s: any) => ({
            session_id: s.session_id,
            title: s.title ?? null,
            created_at:
              typeof s.created_at === "string"
                ? s.created_at
                : s.created_at
                  ? new Date(s.created_at).toISOString()
                  : new Date().toISOString(),
            updated_at:
              typeof s.updated_at === "string"
                ? s.updated_at
                : s.updated_at
                  ? new Date(s.updated_at).toISOString()
                  : new Date().toISOString(),
            version: s.version ?? 0,
          }))

          return c.json({ cliSessions: sessions, nextCursor: result.nextCursor ?? null })
        } catch (err: any) {
          console.error("[Strata Gateway] cloud-sessions: unhandled error", err?.message ?? err)
          return c.json({ error: "Internal error" }, 500)
        }
      },
    )
}
