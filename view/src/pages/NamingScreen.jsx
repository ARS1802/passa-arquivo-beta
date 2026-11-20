import { useState } from "react";
import { Alert, Button, Card, Container, Form } from "react-bootstrap";
import fetcher from "../../../controller/fetchers/Fetcher.js";

function NamingScreen({ initialName = "", onSaved, onBack }) {
  const [nome, setNome] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = nome.trim().length > 0 && [...nome].length <= 15 && !/\s/u.test(nome);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const identity = await fetcher.setLocalName(nome);
      onSaved(identity);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h4">Nome deste Peer</Card.Header>
        <Card.Body>
          <p>{onBack ? "Altere o nome que identifica este computador na rede." : "Escolha um nome para este computador antes de continuar."}</p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="peer-name" className="mb-3">
              <Form.Label>Nome</Form.Label>
              <Form.Control
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                required
                pattern="\S{1,15}"
                disabled={busy}
                aria-describedby="peer-name-help"
                autoComplete="off"
              />
              <Form.Text id="peer-name-help">Use de 1 a 15 caracteres, sem espaços.</Form.Text>
            </Form.Group>
            <Button type="submit" disabled={busy || !valid} className="me-2">
              {busy ? "Salvando..." : "Salvar nome"}
            </Button>
            {onBack && (
              <Button type="button" variant="secondary" onClick={onBack} disabled={busy}>
                Voltar para arquivos
              </Button>
            )}
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default NamingScreen;
