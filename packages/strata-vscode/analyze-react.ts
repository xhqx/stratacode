import { Project, SyntaxKind, VariableDeclaration } from "ts-morph";

const project = new Project({ compilerOptions: { jsx: 1 /* Preserve */ } });
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/webview-ui/agent-manager/AgentManagerApp.tsx");
const file = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/webview-ui/agent-manager/AgentManagerApp.tsx");

const decl = file.getVariableDeclarationOrThrow("AgentManagerContent");
const init = decl.getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);

const functions = init.getFunctions().map(f => ({
    name: f.getName() || "anonymous",
    lines: f.getEndLineNumber() - f.getStartLineNumber()
})).sort((a, b) => b.lines - a.lines);

console.log("--- Inner Functions ---");
console.log(functions.slice(0, 10).map(f => `${f.name}: ${f.lines} lines`).join("\n"));

const varDecls = init.getVariableDeclarations().map(v => ({
    name: v.getName(),
    lines: v.getEndLineNumber() - v.getStartLineNumber()
})).sort((a, b) => b.lines - a.lines);

console.log("--- Inner Variables ---");
console.log(varDecls.slice(0, 20).map(v => `${v.name}: ${v.lines} lines`).join("\n"));
