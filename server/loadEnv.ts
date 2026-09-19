import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const loadedLocal = dotenv.config({ path: path.join(root, ".env.local") });
const loadedEnv = dotenv.config({ path: path.join(root, ".env") });

export const envRoot = root;
export const envDebug = {
  root,
  localPath: path.join(root, ".env.local"),
  loadedLocalKeys: loadedLocal.parsed ? Object.keys(loadedLocal.parsed).length : 0,
  loadedEnvKeys: loadedEnv.parsed ? Object.keys(loadedEnv.parsed).length : 0,
  localError: loadedLocal.error?.message,
};
