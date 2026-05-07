import { Project, SyntaxKind, PropertyDeclaration, VariableStatement, FunctionDeclaration } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/acp/**/*.ts");

const agentFile = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/acp/agent.ts");
const agentClass = agentFile.getClassOrThrow("Agent");

// Make all private properties public so external handlers can access them
agentClass.getProperties().forEach((prop: PropertyDeclaration) => {
    if (prop.hasModifier(SyntaxKind.PrivateKeyword)) {
        prop.toggleModifier("private", false);
    }
});
agentClass.getMethods().forEach((method) => {
    if (method.hasModifier(SyntaxKind.PrivateKeyword)) {
        method.toggleModifier("private", false);
    }
});

// Export all top-level variables and functions so handlers can import them
const topLevelExports: string[] = [];

agentFile.getVariableStatements().forEach((v: VariableStatement) => {
    if (!v.isExported()) {
        v.setIsExported(true);
    }
    v.getDeclarations().forEach(d => topLevelExports.push(d.getName()));
});

agentFile.getFunctions().forEach((f: FunctionDeclaration) => {
    if (!f.isExported()) {
        f.setIsExported(true);
    }
    topLevelExports.push(f.getName()!);
});

// Create handlers directory
const handlersDir = "/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/acp/handlers";
if (!fs.existsSync(handlersDir)) {
    fs.mkdirSync(handlersDir, { recursive: true });
}

// Get all imports and fix relative paths
const allImportsText = agentFile.getImportDeclarations().map(i => {
    let specifier = i.getModuleSpecifierValue();
    if (specifier.startsWith("./")) {
        specifier = "../" + specifier.substring(2);
    } else if (specifier.startsWith("../")) {
        specifier = "../" + specifier;
    }
    return i.getText().replace(i.getModuleSpecifierValue(), specifier);
}).join("\n");

const methods = agentClass.getMethods();

for (const method of methods) {
    const text = method.getText();
    const lineCount = text.split("\n").length;
    const name = method.getName();
    
    // Extract methods larger than 40 lines
    if (lineCount > 40 && name !== "constructor") {
        console.log(`Extracting ${name} (${lineCount} lines)`);
        
        const isAsync = method.hasModifier(SyntaxKind.AsyncKeyword);
        const params = method.getParameters().map(p => p.getText()).join(", ");
        const paramNames = method.getParameters().map(p => p.getName()).join(", ");
        const returnType = method.getReturnTypeNode()?.getText() || "";
        const returnTypeStr = returnType ? `: ${returnType}` : "";
        
        let bodyText = method.getBodyText() || "";
        bodyText = bodyText.replace(/\bthis\./g, "agent.");
        
        const handlerContent = `
${allImportsText}
import { Agent, ${topLevelExports.join(", ")} } from "../agent";

export ${isAsync ? "async " : ""}function ${name}(agent: Agent${params ? ", " + params : ""})${returnTypeStr} {
${bodyText}
}
`;
        const handlerFilePath = path.join(handlersDir, `${name}.ts`);
        fs.writeFileSync(handlerFilePath, handlerContent);
        
        agentFile.addImportDeclaration({
            namedImports: [name],
            moduleSpecifier: `./handlers/${name}`
        });
        
        method.setBodyText(`return ${name}(this${paramNames ? ", " + paramNames : ""});`);
    }
}

agentFile.saveSync();
console.log("Done.");
