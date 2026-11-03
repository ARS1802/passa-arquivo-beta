export default function errorHandler(error, request, response, next) {
  if (error.type === "entity.too.large") {
    return response
      .status(413)
      .json({ error: "Arquivo excede o limite de 100 MB." });
  }

  console.error(error);
  return response.status(500).json({ error: "Erro interno do servidor." });
}
