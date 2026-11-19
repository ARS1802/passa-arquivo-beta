export async function listFiles(apiUrl, directoryPath = "") {
  const response = await fetch(`${apiUrl}/files/list/${encodeURIComponent(directoryPath)}`);

  if (!response.ok) {
    let message = `Não foi possível listar os arquivos (${response.status}).`;

    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Mantém a mensagem padrão quando a API não retorna JSON.
    }

    throw new Error(message);
  }

  const result = await response.json();

  if (
    !result ||
    !Array.isArray(result.directories) ||
    !result.directories.every((directory) => directory && typeof directory.name === "string") ||
    !Array.isArray(result.files) ||
    !result.files.every(
      (file) =>
        file &&
        typeof file === "object" &&
        typeof file.filename === "string" &&
        typeof file.mimeType === "string" &&
        Number.isInteger(file.size) &&
        file.size >= 0 &&
        typeof file.lastModified === "string",
    )
  ) {
    throw new Error(
      "A resposta da API não contém uma lista de arquivos e diretórios válida.",
    );
  }

  return result;
}
