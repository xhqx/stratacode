import { GitOps } from "./packages/strata-vscode/src/agent-manager/GitOps";
import { resolveLocalDiffTarget } from "./packages/strata-vscode/src/review-utils";

async function main() {
  const gitOps = new GitOps({ log: console.log });
  const result = await resolveLocalDiffTarget(gitOps, console.log, process.cwd());
  console.log("RESULT:", result);
  gitOps.dispose();
}

main().catch(console.error);
