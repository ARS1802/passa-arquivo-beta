import path from "node:path";

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const DEFAULT_MIME_TYPE = "application/octet-stream";
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const mimeTypePattern = /^[\w!#$&^.-]+\/[\w!#$&^.+-]+$/;

export default class File {
  constructor(filename, data, mimeType = DEFAULT_MIME_TYPE) {
    if (!File.isValidFilename(filename)) {
      throw new TypeError("Nome de arquivo inválido.");
    }

    if (!Buffer.isBuffer(data)) {
      throw new TypeError("O conteúdo do arquivo deve ser um Buffer.");
    }

    if (typeof mimeType !== "string" || !mimeTypePattern.test(mimeType)) {
      throw new TypeError("MIME type inválido.");
    }

    this.filename = filename;
    this.data = data;
    this.mimeType = mimeType;
  }

  static isValidFilename(filename) {
    const filenamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

    return (
      typeof filename === "string" &&
      filename.length > 0 &&
      filename.length <= 255 &&
      filenamePattern.test(filename) &&
      path.basename(filename) === filename
    );
  }

  static get MAX_FILE_SIZE() {
    return MAX_FILE_SIZE;
  }

  static fromBase64(filename, data, mimeType) {
    if (typeof data !== "string" || !base64Pattern.test(data)) {
      throw new TypeError("O campo data deve ser um Base64 válido.");
    }

    return new File(filename, Buffer.from(data, "base64"), mimeType);
  }

  get size() {
    return this.data.length;
  }

  toBase64() {
    return this.data.toString("base64");
  }
}
