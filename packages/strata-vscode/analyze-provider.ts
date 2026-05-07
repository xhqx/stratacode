import { Project } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const file = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const clazz = file.getClassOrThrow("StrataProvider");

const methods = clazz.getMethods().map(m => ({
    name: m.getName(),
    lines: m.getEndLineNumber() - m.getStartLineNumber()
})).sort((a, b) => b.lines - a.lines);

console.log(methods.slice(0, 30).map(m => `${m.name}: ${m.lines} lines`).join("\n"));
