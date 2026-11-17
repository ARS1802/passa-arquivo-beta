import { useEffect, useState } from "react";
import { Alert, Button, Card, Container, Form } from "react-bootstrap";
import api from "../../../controller/fetchers/API.js";

function SelectDir({ onBack }) {
  const [directory, setDirectory] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [path, setPath] = useState("");
  const [selectedName, setSelectedName] = useState("");

  useEffect(() => {
    let active = true;
    api.getSharedDir()
      .then((saved) => { if (active) setDirectory(saved); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function handlePick() {
    setError("");
    if (!window.showDirectoryPicker) {
      setError("Este navegador não oferece o seletor de pastas. Informe o caminho absoluto abaixo.");
      return;
    }
    try {
      const selected = await window.showDirectoryPicker();
      setSelectedName(selected.name);
      // O handle do navegador não revela o caminho absoluto para a API.
      setPath("");
    } catch (pickerError) {
      if (pickerError.name !== "AbortError") setError(pickerError.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setDirectory(await api.setSharedDir(path));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h4">Diretório compartilhado</Card.Header>
        <Card.Body>
          <p>Escolha a pasta deste computador que deseja compartilhar na rede.</p>
          <p role="status" className="text-break">
            {directory ? <>Pasta compartilhada: <strong>{directory}</strong></> : "Nenhum diretório confirmado nesta sessão."}
          </p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Button type="button" onClick={handlePick} disabled={busy} className="mb-3">
            Escolher diretório
          </Button>
          {selectedName && <p>Pasta selecionada: <strong>{selectedName}</strong></p>}
          <Form onSubmit={handleSubmit} className="mb-3">
            <Form.Group controlId="shared-directory-path" className="mb-3">
              <Form.Label>Caminho absoluto</Form.Label>
              <Form.Control value={path} onChange={(event) => setPath(event.target.value)} required disabled={busy} aria-describedby="shared-directory-help" placeholder="/home/usuario/Compartilhado" />
              <Form.Text id="shared-directory-help">
                O navegador não informa o endereço completo da pasta selecionada. Copie esse endereço e cole aqui. Este é o caminho que será compartilhado.
              </Form.Text>
            </Form.Group>
            <Button type="submit" disabled={busy || !path.trim()}>
              {busy ? "Aguarde..." : "Compartilhar diretório"}
            </Button>
          </Form>
          <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
            Ir para arquivos
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default SelectDir;
