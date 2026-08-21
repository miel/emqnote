import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  uniquePath as findUniquePath,
  type PathAccess,
} from "@emqnote/core/filename";

export {
  isoWithOffset,
  MAX_TITLE_LENGTH,
  noteFileName,
  sanitiseFolderName,
  sanitiseTitle,
  timestampPrefix,
} from "@emqnote/core/filename";

const nodePathAccess: PathAccess = { exists: existsSync, join };

/** Node filesystem adapter around the shared collision-name contract. */
export function uniquePath(directory: string, fileName: string): string {
  return findUniquePath(directory, fileName, nodePathAccess);
}
