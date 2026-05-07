import * as fs from "fs";
import * as path from "path";

const dir = "/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/lsp/servers";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".ts"));

for (const file of files) {
    const fullPath = path.join(dir, file);
    let content = fs.readFileSync(fullPath, "utf-8");
    
    // Fix imports:
    // Change `import { Info, Handle, log, pathExists, run } from "../server";`
    // to:
    // `import type { Info, Handle } from "../server";\nimport { log, pathExists, run, NearestRoot } from "../server";`
    content = content.replace(
        /import { Info, Handle, log, pathExists, run } from "\.\.\/server";/g,
        `import type { Info, Handle } from "../server";\nimport { log, pathExists, run, NearestRoot } from "../server";`
    );
    
    // Also, if the file uses `tsCheck` or `findExecutable` or `Npm`, those might need importing too. Let's export `NearestRoot` from server.ts and let typecheck run to see what else is missing.
    fs.writeFileSync(fullPath, content);
}
console.log("Imports fixed.");
