import { useEffect, useState } from "react";
import { Alert, Button, Card, Container } from "react-bootstrap";
import api from "../../../controller/fetchers/API.js";

function SelectDir({ onBack }) {
  const [directory, setDirectory] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.getSharedDir()
      .then((saved) => { if (active) setDirectory(saved); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function handleSelect() {
    setBusy(true);
    setError("");
    try {
      const selected = await api.selectDirectory();
      if (selected !== null) setDirectory(await api.setSharedDir(selected));
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
          <Button type="button" onClick={handleSelect} disabled={busy} className="me-2">
            {busy ? "Aguarde..." : "Escolher diretório"}
          </Button>
          <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
            Ir para arquivos
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default SelectDir;
