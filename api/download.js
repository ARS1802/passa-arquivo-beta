const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

function base64ToBlob(data, mimeType) {
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new Blob([bytes], { type: mimeType });
}

export async function downloadFile(filename) {
  const response = await fetch(
    `${API_URL}/files/download/${encodeURIComponent(filename)}`,
  );

  if (!response.ok) {
    let message = `Não foi possível baixar o arquivo (${response.status}).`;

    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Mantém a mensagem padrão quando a API não retorna JSON.
    }

    throw new Error(message);
  }

  const file = await response.json();

  if (
    typeof file.filename !== "string" ||
    typeof file.data !== "string" ||
    typeof file.mimeType !== "string"
  ) {
    throw new Error("A resposta da API não contém um arquivo válido.");
  }

  const blob = base64ToBlob(file.data, file.mimeType);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return file;
}