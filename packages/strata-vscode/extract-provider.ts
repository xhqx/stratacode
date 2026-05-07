import { Project, SyntaxKind, PropertyDeclaration, VariableStatement, FunctionDeclaration } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/**/*.ts");

const file = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const clazz = file.getClassOrThrow("StrataProvider");

// 1. Make private properties public
clazz.getProperties().forEach((prop: PropertyDeclaration) => {
    if (prop.hasModifier(SyntaxKind.PrivateKeyword)) {
        prop.toggleModifier("private", false);
    }
});
clazz.getMethods().forEach((method) => {
    if (method.hasModifier(SyntaxKind.PrivateKeyword)) {
        method.toggleModifier("private", false);
    }
});

// 2. Export top-level items
const topLevelExports: string[] = [];

file.getVariableStatements().forEach((v: VariableStatement) => {
    if (!v.isExported() && !v.hasModifier(SyntaxKind.DeclareKeyword)) {
        v.setIsExported(true);
    }
    v.getDeclarations().forEach(d => topLevelExports.push(d.getName()));
});

file.getFunctions().forEach((f: FunctionDeclaration) => {
    if (!f.isExported()) {
        f.setIsExported(true);
    }
    topLevelExports.push(f.getName()!);
});

// Create handlers directory
const handlersDir = "/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/handlers";
if (!fs.existsSync(handlersDir)) {
    fs.mkdirSync(handlersDir, { recursive: true });
}

// 3. Fix imports
const allImportsText = file.getImportDeclarations().map(i => {
    let specifier = i.getModuleSpecifierValue();
    if (specifier.startsWith("./")) {
        specifier = "../" + specifier.substring(2);
    } else if (specifier.startsWith("../")) {
        specifier = "../" + specifier;
    }
    return i.getText().replace(i.getModuleSpecifierValue(), specifier);
}).join("\n");

// 4. Extract large methods
const methods = clazz.getMethods();

for (const method of methods) {
    const text = method.getText();
    const lineCount = text.split("\n").length;
    const name = method.getName();
    
    // Some methods are too core or too risky to extract, like resolveWebviewView, constructor
    if (["resolveWebviewView", "constructor", "attachToWebview", "resolveWebviewPanel", "dispose"].includes(name)) {
        continue;
    }
    
    if (lineCount > 15) {
        console.log(`Extracting ${name} (${lineCount} lines)`);
        
        const isAsync = method.hasModifier(SyntaxKind.AsyncKeyword);
        const params = method.getParameters().map(p => p.getText()).join(", ");
        const paramNames = method.getParameters().map(p => p.getName()).join(", ");
        const returnType = method.getReturnTypeNode()?.getText() || "";
        const returnTypeStr = returnType ? `: ${returnType}` : "";
        
        let bodyText = method.getBodyText() || "";
        // Replace `this.` with `provider.`, except when `this` is alone.
        bodyText = bodyText.replace(/\bthis\./g, "provider.");
        // Replace `this` alone (like `provider = this`) with `provider`
        bodyText = bodyText.replace(/\bthis\b/g, "provider");
        
        const handlerContent = `
${allImportsText}
import { StrataProvider${topLevelExports.length > 0 ? ", " + topLevelExports.join(", ") : ""} } from "../StrataProvider";

export ${isAsync ? "async " : ""}function ${name}(provider: StrataProvider${params ? ", " + params : ""})${returnTypeStr} {
${bodyText}
}
`;
        const handlerFilePath = path.join(handlersDir, `${name}.ts`);
        fs.writeFileSync(handlerFilePath, handlerContent);
        
        file.addImportDeclaration({
            namedImports: [name],
            moduleSpecifier: `./handlers/${name}`
        });
        
        method.setBodyText(`return ${name}(this${paramNames ? ", " + paramNames : ""});`);
    }
}

file.saveSync();
console.log("Done.");
