import { useState } from "react";
import { Alert, Button, Form, InputGroup } from "react-bootstrap";
import api from "../../api/api.js";

function ApiUrlConfig() {
  const [value, setValue] = useState(() => api.getApiUrl());
  const [feedback, setFeedback] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setFeedback("");

    try {
      setValue(api.setApiUrl(value));
      setFeedback("URL da API salva.");
    } catch (error) {
      setFeedback(error.message);
    }
  }

  return (
    <Form onSubmit={handleSubmit} className="mb-4">
      <Form.Label htmlFor="api-url">URL da API</Form.Label>
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
      {feedback && (
        <Alert
          variant={feedback === "URL da API salva." ? "success" : "danger"}
          className="mt-2 mb-0"
        >
          {feedback}
        </Alert>
      )}
    </Form>
  );
}

export default ApiUrlConfig;
