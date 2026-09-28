import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export const hashText = (text: string) => createHash("sha1").update(text).digest("hex");

/** Content hash of each file as Octoplan last wrote or saw it; the watcher uses it to skip echoes. */
export class KnownHashes {
  private readonly hashes = new Map<string, string>();
  private key = (path: string) => {
    const full = resolve(path);
    return process.platform === "win32" ? full.toLowerCase() : full;
  };
  get(path: string) {
    return this.hashes.get(this.key(path));
  }
  set(path: string, hash: string | undefined) {
    if (hash === undefined) this.hashes.delete(this.key(path));
    else this.hashes.set(this.key(path), hash);
  }
}

/** Reads a text file; a missing file is null, never an error. */
export const readTextOrNull = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isCode(error, "ENOENT", "ENOTDIR", "EISDIR")) return null;
    throw error;
  }
};

export const isTempFile = (name: string) => name.includes(".octoplan-") && name.endsWith(".tmp");

const RETRYABLE = ["EPERM", "EACCES", "EBUSY"];

/**
 * Temp file in the same directory, then rename. On Windows a rename over a file that a
 * watcher or scanner has open briefly fails with EPERM/EBUSY, so it is retried.
 */
export const writeFileAtomic = async (path: string, text: string) => {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.octoplan-${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(temp, text, "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(temp, path);
      return;
    } catch (error) {
      if (attempt >= 20 || !isCode(error, ...RETRYABLE)) {
        await rm(temp, { force: true });
        throw error;
      }
      await new Promise((done) => setTimeout(done, 10 + attempt * 10));
    }
  }
};

/**
 * Serializes read-modify-write cycles per file, so two plan tools firing together each see
 * the other's result. Records the written content's hash before the rename lands.
 */
export class FileWriter {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(readonly hashes: KnownHashes = new KnownHashes()) {}

  /**
   * `change` receives the current text (null when missing) and returns the new text plus a
   * result. Returning `text: null` skips the write.
   */
  mutate<T>(
    path: string,
    change: (current: string | null) => { text: string | null; result: T },
  ): Promise<T> {
    const key = resolve(path);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const current = await readTextOrNull(path);
        const { text, result } = change(current);
        if (text !== null && text !== current) {
          this.hashes.set(path, hashText(text));
          try {
            await writeFileAtomic(path, text);
          } catch (error) {
            this.hashes.set(path, current === null ? undefined : hashText(current));
            throw error;
          }
        }
        return result;
      });
    this.queues.set(key, run);
    void run
      .catch(() => undefined)
      .finally(() => {
        if (this.queues.get(key) === run) this.queues.delete(key);
      });
    return run;
  }

  /** Resolves once every queued write has settled. */
  async idle() {
    while (this.queues.size > 0) {
      await Promise.allSettled([...this.queues.values()]);
    }
  }
}

const isCode = (error: unknown, ...codes: string[]) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  codes.includes(String((error as { code: unknown }).code));
