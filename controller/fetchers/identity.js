import { exchangeKeys } from "./key.js";

async function requestLocalIdentity(apiUrl, options) {
  const response = await fetch(`${apiUrl}/identity`, options);
  const identity = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      identity?.error ||
        `Não foi possível acessar a identidade local (${response.status}).`,
    );
  }
  if (
    !identity ||
    typeof identity.ip !== "string" ||
    !identity.ip ||
    typeof identity.id !== "string" ||
    !identity.id ||
    typeof identity.publicKey !== "string" ||
    !identity.publicKey.trim() ||
    (identity.nome != null && typeof identity.nome !== "string")
  ) {
    throw new Error("A resposta da API não contém uma identidade válida.");
  }
  return identity;
}

export function getLocalIdentity(apiUrl, { signal } = {}) {
  return requestLocalIdentity(apiUrl, { cache: "no-store", signal });
}

export async function setLocalName(apiUrl, nome) {
  const identity = await requestLocalIdentity(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  if (
    typeof identity.nome !== "string" ||
    !identity.nome.trim() ||
    identity.nome !== nome
  ) {
    throw new Error("A API não confirmou o nome informado.");
  }
  return identity;
}

/** Cada resposta 200 inicia sua própria troca, sem esperar os outros endereços. */
export function requestIdentity(
  apiUrl,
  localIdentity,
  { timeout = 20000, path = "/", signal, localApiUrl } = {},
) {
  const requestSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  console.log(apiUrl);
  return fetch(`${apiUrl}${path}`, {
    signal: requestSignal,
    redirect: "manual",
    cache: "no-store",
  })
    .then(async (response) => {
      // A descoberta usa apenas o status; não precisa baixar o corpo da resposta.
      await response.body?.cancel();
      if (response.status !== 200) return null;
      requestSignal.throwIfAborted();
      return exchangeKeys(apiUrl, localIdentity, {
        localApiUrl,
        signal: requestSignal,
      });
    })
    .catch(() => null); // Endereços indisponíveis ou respostas inválidas não interrompem a rede.
}
