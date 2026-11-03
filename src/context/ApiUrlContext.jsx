import { useMemo, useState } from "react";
import api from "../../api/api.js";
import ApiUrlContext from "./apiUrlContext.js";

export function ApiUrlProvider({ children }) {
  const [apiUrl, setApiUrlState] = useState(() => api.getApiUrl());

  function updateApiUrl(value) {
    const normalizedUrl = api.setApiUrl(value);
    setApiUrlState(normalizedUrl);
  }

  const contextValue = useMemo(
    () => ({ apiUrl, updateApiUrl }),
    [apiUrl],
  );

  return (
    <ApiUrlContext.Provider value={contextValue}>
      {children}
    </ApiUrlContext.Provider>
  );
}
