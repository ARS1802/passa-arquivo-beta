import { Button, Card, Container } from "react-bootstrap";
import ApiUrlConfig from "../components/ApiUrlConfig.jsx";

function ApiUrlPage({ onBack }) {
  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h4">Configurar API</Card.Header>
        <Card.Body>
          <ApiUrlConfig />
          <Button type="button" variant="secondary" onClick={onBack}>
            Voltar para arquivos
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
}

export default ApiUrlPage;
