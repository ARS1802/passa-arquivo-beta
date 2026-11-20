async function requestIdentity(apiUrl, options) {
  const response = await fetch(`${apiUrl}/identity`, options);
  const identity = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(identity?.error || `Não foi possível acessar a identidade local (${response.status}).`);
  }
  if (!identity || typeof identity.ip !== "string" || !identity.ip ||
      typeof identity.id !== "string" || !identity.id ||
      (identity.nome != null && typeof identity.nome !== "string")) {
    throw new Error("A resposta da API não contém uma identidade válida.");
  }
  return identity;
}

export function getLocalIdentity(apiUrl) {
  return requestIdentity(apiUrl, { cache: "no-store" });
}

export async function setLocalName(apiUrl, nome) {
  const identity = await requestIdentity(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  if (typeof identity.nome !== "string" || !identity.nome.trim() || identity.nome !== nome) {
    throw new Error("A API não confirmou o nome informado.");
  }
  return identity;
}
