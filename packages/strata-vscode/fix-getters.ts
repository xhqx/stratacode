import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const file = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const clazz = file.getClassOrThrow("StrataProvider");

clazz.getGetAccessors().forEach(accessor => {
    if (accessor.hasModifier(SyntaxKind.PrivateKeyword)) {
        accessor.toggleModifier("private", false);
    }
});
clazz.getSetAccessors().forEach(accessor => {
    if (accessor.hasModifier(SyntaxKind.PrivateKeyword)) {
        accessor.toggleModifier("private", false);
    }
});

file.saveSync();
console.log("Getters/setters updated.");
