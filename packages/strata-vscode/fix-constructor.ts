import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const file = project.getSourceFileOrThrow("/Users/aleksejgriskovec/AntigravityProjects/stratacode/packages/strata-vscode/src/StrataProvider.ts");
const clazz = file.getClassOrThrow("StrataProvider");

// Make constructor parameters public
const ctors = clazz.getConstructors();
if (ctors.length > 0) {
    ctors[0].getParameters().forEach(param => {
        if (param.hasModifier(SyntaxKind.PrivateKeyword)) {
            param.toggleModifier("private", false);
            param.toggleModifier("public", true);
        }
        if (param.hasModifier(SyntaxKind.ProtectedKeyword)) {
            param.toggleModifier("protected", false);
            param.toggleModifier("public", true);
        }
    });
}

// Make sure properties that are added dynamically are handled if there are any others
clazz.getProperties().forEach(prop => {
    if (prop.hasModifier(SyntaxKind.PrivateKeyword)) {
        prop.toggleModifier("private", false);
    }
    if (prop.hasModifier(SyntaxKind.ProtectedKeyword)) {
        prop.toggleModifier("protected", false);
    }
});

file.saveSync();
console.log("Constructor parameters updated.");
