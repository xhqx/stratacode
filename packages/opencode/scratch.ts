import { Schema } from "effect"
const S = Schema.Union([Schema.Literal("stdio"), Schema.Literal("http")])
console.log(Schema.decodeUnknownSync(S)("http"))
