export async function uploadFile(apiUrl, file) {
  const response = await fetch(`${apiUrl}/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(file),
  });

  if (!response.ok) {
    let message = `Não foi possível enviar o arquivo (${response.status}).`;

    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      // Mantém a mensagem padrão quando a API não retorna JSON.
    }

    throw new Error(message);
  }

  return response.json();
}