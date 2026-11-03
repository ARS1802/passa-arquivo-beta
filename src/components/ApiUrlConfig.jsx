import { useState } from "react";
import { Alert, Button, Form, InputGroup } from "react-bootstrap";
import api from "../../api/api.js";

function ApiUrlConfig() {
  const [value, setValue] = useState("");
  const [selectedApiUrl, setSelectedApiUrl] = useState(
    () => api.getSelectedApiUrl(),
  );
  const [feedback, setFeedback] = useState("");
  const [feedbackVariant, setFeedbackVariant] = useState("danger");
  const [checking, setChecking] = useState(false);

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

  return (
    <Form onSubmit={handleSubmit} className="mb-4">
      <Form.Label htmlFor="api-url">Adicionar URL da API</Form.Label>
      <InputGroup>
        <Form.Control
          id="api-url"
          type="url"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://api.exemplo.com"
          required
        />
        <Button type="submit">Salvar</Button>
      </InputGroup>
      <Form.Select
        className="mt-2"
        value={selectedApiUrl}
        onChange={handleApiUrlChange}
        aria-label="URL da API selecionada"
      >
        {api.apiUrl.map((apiUrl) => (
          <option key={apiUrl} value={apiUrl}>
            {apiUrl}
          </option>
        ))}
      </Form.Select>
      <Button
        type="button"
        variant="outline-primary"
        onClick={handleHealthCheck}
        disabled={checking}
        className="mt-2"
      >
        {checking ? "Testando..." : "Testar URL selecionada"}
      </Button>
      {feedback && (
        <Alert
          variant={feedbackVariant}
          className="mt-2 mb-0"
        >
          {feedback}
        </Alert>
      )}
    </Form>
  );
}

export default ApiUrlConfig;
