/** Troca as chaves com o destino e pede ao backend local para recuperar o id. */
export async function exchangeKeys(apiUrl, localIdentity, { localApiUrl, signal } = {}) {
  const response = await fetch(`${apiUrl}/identity/key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: localIdentity.nome,
      ip: localIdentity.ip,
      pubKey: localIdentity.publicKey,
    }),
    redirect: "error",
    signal,
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    return null;
  }
  const encryptedIdentity = await response.json();
  signal?.throwIfAborted();
  const decrypted = await fetch(`${localApiUrl}/identity/key/decrypt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(encryptedIdentity),
    redirect: "error",
    signal,
  });
  if (decrypted.status === 400) {
    await decrypted.body?.cancel();
    return null;
  }
  if (decrypted.status !== 200) {
    await decrypted.body?.cancel();
    throw new Error("Não foi possível descriptografar a identidade na API local.");
  }
  return decrypted.json();
}
