import { Project } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/session/prompt.ts");
const file = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/opencode/src/session/prompt.ts");

const functions = file.getFunctions().map(f => ({
    name: f.getName() || "anonymous",
    lines: f.getEndLineNumber() - f.getStartLineNumber()
})).sort((a, b) => b.lines - a.lines);

console.log("--- Functions ---");
console.log(functions.slice(0, 15).map(f => `${f.name}: ${f.lines} lines`).join("\n"));

const classes = file.getClasses().map(c => ({
    name: c.getName() || "anonymous",
    lines: c.getEndLineNumber() - c.getStartLineNumber()
})).sort((a, b) => b.lines - a.lines);

console.log("--- Classes ---");
console.log(classes.slice(0, 10).map(c => `${c.name}: ${c.lines} lines`).join("\n"));

const varDecls = file.getVariableDeclarations().map(v => ({
    name: v.getName(),
    lines: v.getEndLineNumber() - v.getStartLineNumber()
})).sort((a, b) => b.lines - a.lines);

console.log("--- Variables ---");
console.log(varDecls.slice(0, 10).map(v => `${v.name}: ${v.lines} lines`).join("\n"));
