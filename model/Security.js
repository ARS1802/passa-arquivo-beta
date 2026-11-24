import {
  constants,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const KEYS_DIRECTORY = new URL("../controller/.keys/", import.meta.url);
const PUBLIC_KEY_FILE = new URL("public.pem", KEYS_DIRECTORY);
const PRIVATE_KEY_FILE = new URL("private.pem", KEYS_DIRECTORY);

function readKey(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export default class Security {
  static #publicKey;
  static #privateKey;

  static get publicKey() {
    return this.#publicKey;
  }

  static get privateKey() {
    return this.#privateKey;
  }

  /** Carrega o par existente ou gera um novo quando ambos os arquivos faltam. */
  static generateKeys() {
    let publicKey = readKey(PUBLIC_KEY_FILE);
    let privateKey = readKey(PRIVATE_KEY_FILE);

    // Não trocamos a identidade silenciosamente se um arquivo foi perdido.
    if ((publicKey === null) !== (privateKey === null)) {
      throw new Error("Par de chaves incompleto em controller/.keys.");
    }

    if (publicKey === null) {
      ({ publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 3072,
        //spki: subject public key info
        publicKeyEncoding: { type: "spki", format: "pem" },
        //pkcs: private key cryptography standard
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        //pem: fomrato de texto "-----BEGIN PRIVATE KEY-----"
      }));
      mkdirSync(KEYS_DIRECTORY, { recursive: true, mode: 0o700 });
      chmodSync(KEYS_DIRECTORY, 0o700);
      // wx impede sobrescrever chaves criadas por outra instância.
      writeFileSync(PRIVATE_KEY_FILE, privateKey, { flag: "wx", mode: 0o600 });
      writeFileSync(PUBLIC_KEY_FILE, publicKey, { flag: "wx", mode: 0o600 });
    }

    const privateObject = createPrivateKey(privateKey);
    const publicObject = createPublicKey(publicKey);
    const derivedPublicKey = createPublicKey(privateObject);
    if (
      privateObject.asymmetricKeyType !== "rsa" ||
      publicObject.asymmetricKeyType !== "rsa" ||
      publicObject.asymmetricKeyDetails.modulusLength < 3072 ||
      !derivedPublicKey.equals(publicObject)
    ) {
      throw new Error(
        "Os arquivos devem conter um par correspondente de chaves RSA de pelo menos 3072 bits.",
      );
    }

    // Em sistemas POSIX, somente o dono pode acessar a pasta e os arquivos.
    chmodSync(KEYS_DIRECTORY, 0o700);
    chmodSync(PRIVATE_KEY_FILE, 0o600);
    chmodSync(PUBLIC_KEY_FILE, 0o600);
    this.#publicKey = publicKey;
    this.#privateKey = privateKey;
  }

  /** Criptografa uma string para o dono da chave pública RSA informada. */
  static crypt(publicKey, info) {
    if (typeof info !== "string")
      throw new TypeError("A informação deve ser uma string.");
    const recipientKey = createPublicKey(publicKey);
    if (
      recipientKey.asymmetricKeyType !== "rsa" ||
      recipientKey.asymmetricKeyDetails.modulusLength < 3072
    ) {
      throw new TypeError(
        "Informe uma chave pública RSA de pelo menos 3072 bits.",
      );
    }
    // RSA protege a chave AES; AES permite criptografar conteúdos longos.
    const key = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(info, "utf8"),
      cipher.final(),
    ]);
    const encryptedKey = publicEncrypt(
      {
        key: recipientKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      key,
    );
    return JSON.stringify({
      version: 1,
      key: encryptedKey.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: encrypted.toString("base64"),
    });
  }

  /** Usa a chave privada informada; nunca retorna conteúdo com autenticação inválida. */
  static decrypt(privateKey, info) {
    if (typeof info !== "string")
      throw new TypeError("A informação deve ser uma string.");
    try {
      const envelope = JSON.parse(info);
      if (!envelope || envelope.version !== 1)
        throw new Error("Versão inválida.");
      const parts = {};
      for (const field of ["key", "iv", "tag", "data"]) {
        const value = envelope[field];
        if (typeof value !== "string") throw new Error("Campo inválido.");
        parts[field] = Buffer.from(value, "base64");
        if (parts[field].toString("base64") !== value)
          throw new Error("Base64 inválido.");
      }
      if (parts.iv.length !== 12 || parts.tag.length !== 16)
        throw new Error("Tamanho inválido.");
      const key = privateDecrypt(
        {
          key: privateKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        parts.key,
      );
      const decipher = createDecipheriv("aes-256-gcm", key, parts.iv, {
        authTagLength: 16,
      });
      decipher.setAuthTag(parts.tag);
      return Buffer.concat([
        decipher.update(parts.data),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error(
        "Não foi possível descriptografar: conteúdo inválido ou chave incorreta.",
      );
    }
  }
}
