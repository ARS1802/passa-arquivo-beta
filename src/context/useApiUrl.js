import { useContext } from "react";
import ApiUrlContext from "./apiUrlContext.js";

export function useApiUrl() {
  const context = useContext(ApiUrlContext);

  if (!context) {
    throw new Error("useApiUrl deve ser usado dentro de ApiUrlProvider.");
  }

  return context;
}
