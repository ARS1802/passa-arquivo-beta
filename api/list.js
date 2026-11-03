const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export async function listFiles() {
  const response = await fetch(`${API_URL}/files`);

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
    !Array.isArray(result.files) ||
    !result.files.every((filename) => typeof filename === "string")
  ) {
    throw new Error("A resposta da API não contém uma lista de arquivos válida.");
  }

  return result.files;
}