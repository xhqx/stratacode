import { Project, VariableStatement, Node } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/lsp/**/*.ts");

const serverFile = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/lsp/server.ts");

// Export shared constants so they can be imported
const sharedConsts = ["log", "pathExists", "run"];
serverFile.getVariableStatements().forEach(v => {
    v.getDeclarations().forEach(d => {
        if (sharedConsts.includes(d.getName()) && !v.isExported()) {
            v.setIsExported(true);
        }
    });
});

const serversDir = "/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/lsp/servers";
if (!fs.existsSync(serversDir)) {
    fs.mkdirSync(serversDir, { recursive: true });
}

// Prepare the imports to include in every server file
const importsText = serverFile.getImportDeclarations().map(i => {
    let text = i.getText();
    const specifier = i.getModuleSpecifierValue();
    if (specifier.startsWith("./")) {
        text = text.replace(specifier, "../" + specifier.substring(2));
    } else if (specifier.startsWith("../")) {
        text = text.replace(specifier, "../" + specifier);
    }
    return text;
}).join("\n");

const serverNames: string[] = [];

// Iterate over variable statements
for (const stmt of serverFile.getVariableStatements()) {
    if (!stmt.isExported()) continue;
    
    for (const decl of stmt.getDeclarations()) {
        const typeNode = decl.getTypeNode();
        if (typeNode && typeNode.getText() === "Info") {
            const name = decl.getName();
            serverNames.push(name);
            
            console.log(`Extracting ${name}`);
            
            // Build the content of the new file
            const content = `
${importsText}
import { Info, Handle, log, pathExists, run } from "../server";

export const ${name}: Info = ${decl.getInitializer()!.getText()};
`;
            fs.writeFileSync(path.join(serversDir, `${name}.ts`), content);
            
            // Replace the declaration in server.ts with an export
            serverFile.addExportDeclaration({
                moduleSpecifier: `./servers/${name}`,
                namedExports: [name]
            });
            
            stmt.remove();
            break; // Assuming one per statement
        }
    }
}

serverFile.saveSync();
console.log("Done extracting " + serverNames.length + " servers.");
