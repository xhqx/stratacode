// stratacode_change - new file
// Registers all Strata-specific instance routes on a Hono app.
// Called from ../../server/instance/index.ts before the UI fallback route.

import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { TelemetryRoutes } from "../../server/routes/instance/telemetry"
import { CommitMessageRoutes } from "./routes/commit-message"
import { EnhancePromptRoutes } from "../../server/routes/instance/enhance-prompt"
import { StratacodeRoutes } from "../../server/routes/instance/stratacode"
import { PermissionStratacodeRoutes } from "../permission/routes"
import { RemoteRoutes } from "../../server/routes/instance/remote"
import { NetworkRoutes } from "../../server/routes/instance/network"
import { SuggestionRoutes } from "../suggestion/routes"
import { IndexingRoutes } from "./routes/indexing"
import { RepoMapRoutes } from "./routes/repomap" // stratacode_change
import { SessionContextRoutes } from "./routes/session-context"
import { WorkerRoutes } from "./routes/worker" // stratacode_change
import { SuggestTasksRoutes } from "./routes/suggest-tasks" // stratacode_change
import { ChatAutocompleteRoutes } from "./routes/chat-autocomplete" // stratacode_change
import { createStrataRoutes } from "@stratacode/strata-gateway"
import { Auth } from "../../auth"
import { errors } from "../../server/error"
import { ModelCache } from "../../provider/model-cache"
import { Database } from "../../storage"
import { Instance } from "../../project/instance"
import { Session } from "../../session"
import { Identifier } from "../../id/id"
import { SessionTable, MessageTable, PartTable } from "../../session/session.sql"
import { Bus } from "@/bus"

export function register(app: Hono): Hono {
  return app
    .route("/permission", PermissionStratacodeRoutes())
    .route("/network", NetworkRoutes())
    .route("/indexing", IndexingRoutes()) // stratacode_change
    .route("/repomap", RepoMapRoutes()) // stratacode_change
    .route("/suggestion", SuggestionRoutes())
    .route("/telemetry", TelemetryRoutes())
    .route("/remote", RemoteRoutes())
    .route("/commit-message", CommitMessageRoutes())
    .route("/session-context", SessionContextRoutes())
    .route("/enhance-prompt", EnhancePromptRoutes())
    .route("/worker", WorkerRoutes()) // stratacode_change
    .route("/suggest-tasks", SuggestTasksRoutes()) // stratacode_change
    .route("/chat-autocomplete", ChatAutocompleteRoutes()) // stratacode_change
    .route("/stratacode", StratacodeRoutes())
    .route(
      "/strata",
      createStrataRoutes({
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
        SessionToRow: Session.toRow,
        Bus,
        SessionCreatedEvent: Session.Event.Created,
        Identifier,
        ModelCache,
      }),
    )
}
