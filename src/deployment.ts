import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Block direct production calls from a developer checkout or stale dist/ build.
export async function productionCommit(): Promise<string> {
  const commit = process.env.TC_PRODUCTION_COMMIT;
  if (!commit || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error("Production requires the origin/main launcher. Run npm run refresh or npm run refresh:auto.");
  }
  const git = async (args: string[]) => (await promisify(execFile)("git", args)).stdout.trim();
  if (await git(["rev-parse", "HEAD"]) !== commit
    || await git(["rev-parse", "refs/remotes/origin/main"]) !== commit
    || await git(["status", "--porcelain", "--untracked-files=normal"])) {
    throw new Error("Production source changed: expected a clean, pinned origin/main checkout.");
  }
  return commit;
}
