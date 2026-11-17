async function requestDirectory(url, options) {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || `Não foi possível acessar o diretório (${response.status}).`);
  }
  if (!result || (result.SHARED_DIR !== null &&
      (typeof result.SHARED_DIR !== "string" || !result.SHARED_DIR.trim()))) {
    throw new Error("A resposta da API não contém um diretório válido.");
  }
  return result.SHARED_DIR;
}

export function getSharedDir(apiUrl) {
  return requestDirectory(`${apiUrl}/dir`);
}

export async function setSharedDir(apiUrl, directory) {
  const sharedDir = await requestDirectory(`${apiUrl}/dir`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ SHARED_DIR: directory }),
  });
  if (!sharedDir) throw new Error("A API não confirmou o diretório compartilhado.");
  return sharedDir;
}
