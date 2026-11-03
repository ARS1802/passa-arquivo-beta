import path from "node:path";

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
const filenamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function isValidFilename(filename) {
  return (
    typeof filename === "string" &&
    filename.length > 0 &&
    filename.length <= 255 &&
    filenamePattern.test(filename) &&
    path.basename(filename) === filename
  );
}
