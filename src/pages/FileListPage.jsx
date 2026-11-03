import { useState } from "react";
import { Button, Card, Container } from "react-bootstrap";
import { listFiles } from "../../api/list.js";
import DataView from "../components/DataView.jsx";

function FileListPage() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFetchFiles() {
    setLoading(true);
    setError("");

    try {
      setFiles(await listFiles());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h1">Arquivos compartilhados</Card.Header>
        <Card.Body>
          <Button
            type="button"
            onClick={handleFetchFiles}
            disabled={loading}
            className="mb-3"
          >
            {loading ? "Carregando..." : "Buscar arquivos"}
          </Button>
          <DataView data={files} loading={loading} error={error} />
        </Card.Body>
      </Card>
    </Container>
  );
}

export default FileListPage;
