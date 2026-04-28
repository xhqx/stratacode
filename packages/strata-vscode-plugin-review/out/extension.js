"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("strata-review.reviewBranch", async () => {
        const prompt = vscode.workspace
            .getConfiguration("strata-review")
            .get("prompt", "Review the current branch changes and provide feedback.");
        // Approach 1: Use exports API (same extension host)
        const strata = vscode.extensions.getExtension("stratacode.strata-code");
        if (strata?.isActive) {
            try {
                const api = strata.exports;
                if (api && typeof api.sendMessage === "function") {
                    await api.sendMessage(prompt, { focus: true });
                    return;
                }
            }
            catch (err) {
                console.warn("Failed to use Strata exports API, falling back to command:", err);
            }
        }
        // Approach 2: Fall back to command (works across extension hosts, e.g. remote development)
        try {
            await vscode.commands.executeCommand("strata-code.new.api.sendMessage", prompt, { focus: true });
        }
        catch (err) {
            vscode.window.showErrorMessage("Failed to communicate with Strata Code. Is the extension installed and active?");
            console.error("Strata Code sendMessage command failed:", err);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map