import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/vault/update.js -> project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export interface UpdateStatus {
  currentCommit: string;
  remoteCommit: string | null;
  /** Commits behind origin/main, when it could be computed (needs a prior fetch to know). */
  behindBy: number | null;
  upToDate: boolean;
  /** True if the check itself couldn't run — offline, no git, no "origin" remote, etc. Never treat this as an error. */
  checkFailed: boolean;
}

async function run(cmd: string): Promise<string> {
  const { stdout } = await execAsync(cmd, { cwd: PROJECT_ROOT, timeout: 5000 });
  return stdout.trim();
}

/**
 * Read-only version check: compares local HEAD to origin's main branch via `git ls-remote`,
 * which only asks the remote for its current ref — it never downloads objects or touches the
 * working tree. Safe to call on every server startup. Fails silently (checkFailed: true) if
 * offline, this isn't a git checkout, or there's no "origin" remote — never throws.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    const currentCommit = await run("git rev-parse HEAD");
    const remoteRef = await run("git ls-remote origin refs/heads/main");
    const remoteCommit = remoteRef.split(/\s+/)[0] || null;

    if (!remoteCommit) {
      return { currentCommit, remoteCommit: null, behindBy: null, upToDate: true, checkFailed: true };
    }
    if (remoteCommit === currentCommit) {
      return { currentCommit, remoteCommit, behindBy: 0, upToDate: true, checkFailed: false };
    }

    // Best-effort commit count — only works if the remote commit object is already fetched
    // locally. If not, we still know an update exists, just not exactly how far behind.
    let behindBy: number | null = null;
    try {
      const count = await run(`git rev-list --count ${currentCommit}..${remoteCommit}`);
      behindBy = Number.parseInt(count, 10);
      if (Number.isNaN(behindBy)) behindBy = null;
    } catch {
      behindBy = null;
    }

    return { currentCommit, remoteCommit, behindBy, upToDate: false, checkFailed: false };
  } catch {
    return { currentCommit: "", remoteCommit: null, behindBy: null, upToDate: true, checkFailed: true };
  }
}

/**
 * Applies a pending update: fetches, fast-forwards only (refuses rather than overwriting any
 * local changes or a diverged history), reinstalls dependencies, and rebuilds. Never force-resets
 * or discards anything — if this can't be done safely, it throws instead of guessing.
 */
export async function applyUpdate(onOutput: (line: string) => void): Promise<void> {
  const dirty = await run("git status --porcelain");
  if (dirty) {
    throw new Error(
      "You have uncommitted local changes, so the update was skipped to avoid losing them. " +
        "Commit or stash your changes (e.g. `git stash`), then run update again."
    );
  }

  onOutput(await run("git fetch origin"));
  onOutput(await run("git merge --ff-only origin/main"));
  onOutput("Installing dependencies...");
  onOutput(await run("npm install"));
  onOutput("Building...");
  onOutput(await run("npm run build"));
}
