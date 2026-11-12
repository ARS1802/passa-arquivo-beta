import { useState } from "react";
import { Alert, Button, Form, InputGroup } from "react-bootstrap";
import api from "../../api/api.js";

function ApiUrlConfig() {
  const [value, setValue] = useState("");
  const [selectedApiUrl, setSelectedApiUrl] = useState(() =>
    api.getSelectedApiUrl(),
  );
  const [feedback, setFeedback] = useState("");
  const [feedbackVariant, setFeedbackVariant] = useState("danger");
  const [checking, setChecking] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setFeedback("");
    setFeedbackVariant("danger");

    try {
      api.setApiUrl(value);
      setSelectedApiUrl(api.getSelectedApiUrl());
      setValue("");
      setFeedback("URL da API salva.");
      setFeedbackVariant("success");
    } catch (error) {
      setFeedback(error.message);
    }
  }

  function handleApiUrlChange(event) {
    const nextUrl = api.selectApiUrl(event.target.value);
    setFeedback("");
    setFeedbackVariant("danger");
    setSelectedApiUrl(nextUrl);
  }

  function handleRemoveApiUrl() {
    try {
      const nextUrl = api.removeApiUrl(selectedApiUrl);
      setSelectedApiUrl(nextUrl || "");
      setFeedback("URL da API removida.");
      setFeedbackVariant("success");
    } catch (error) {
      setFeedback(error.message);
      setFeedbackVariant("danger");
    }
  }

  async function handleHealthCheck() {
    setFeedback("");
    setChecking(true);

    try {
      const healthy = await api.isHealthy(selectedApiUrl);
      setFeedbackVariant(healthy ? "success" : "danger");
      setFeedback(
        healthy
          ? "A URL da API está disponível."
          : "A URL da API não está disponível.",
      );
    } finally {
      setChecking(false);
    }
  }

  /** Atualiza as URLs exibidas a cada descoberta e mostra o resultado da busca. */
  async function handleDiscovery() {
    setFeedback("");
    setDiscovering(true);

    try {
      let foundCount = 0;
      const discoveredUrls = await api.discoverApis(() => {
        setSelectedApiUrl(api.getSelectedApiUrl());
        setFeedbackVariant("success");
        setFeedback(
          `${++foundCount} URL(s) encontrada(s). Busca em andamento...`,
        );
      });
      setSelectedApiUrl(api.getSelectedApiUrl());
      setFeedbackVariant("success");
      setFeedback(
        discoveredUrls.length > 0
          ? `${discoveredUrls.length} URL(s) encontrada(s) na rede.`
          : "Nenhuma API disponível foi encontrada na rede.",
      );
      if (discoveredUrls.length === 0) {
        setFeedbackVariant("warning");
      }
    } catch (error) {
      setFeedback(error.message);
      setFeedbackVariant("danger");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="mb-4">
      <Form.Label htmlFor="api-url">Adicionar URL da API</Form.Label>
      <InputGroup>
        <Form.Control
          id="api-url"
          type="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="http://api.exemplo.com:3000"
          required
        />
        <Button type="submit">Salvar</Button>
      </InputGroup>
      <fieldset className="mt-2">
        <legend className="fs-6">URL da API selecionada</legend>
        {api.apiUrl.map((apiUrl) => (
          <InputGroup key={apiUrl} className="mb-2">
            <Form.Check
              id={`api-url-${apiUrl}`}
              type="radio"
              name="api-url"
              label={apiUrl}
              value={apiUrl}
              checked={selectedApiUrl === apiUrl}
              onChange={handleApiUrlChange}
              className="flex-grow-1"
            />
            <Button
              type="button"
              variant="danger"
              onClick={handleRemoveApiUrl}
              disabled={selectedApiUrl !== apiUrl}
              aria-label={`Apagar ${apiUrl}`}
            >
              Apagar
            </Button>
          </InputGroup>
        ))}
      </fieldset>
      <Button
        type="button"
        variant="outline-primary"
        onClick={handleHealthCheck}
        disabled={checking}
        className="mt-2"
      >
        {checking ? "Testando..." : "Testar URL selecionada"}
      </Button>
      <Button
        type="button"
        variant="outline-secondary"
        onClick={handleDiscovery}
        disabled={discovering}
        className="mt-2 ms-2"
      >
        {discovering ? "Procurando..." : "Procurar APIs na rede"}
      </Button>
      {feedback && (
        <Alert variant={feedbackVariant} className="mt-2 mb-0">
          {feedback}
        </Alert>
      )}
    </Form>
  );
}

export default ApiUrlConfig;
