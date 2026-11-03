import { useState } from "react";
import { Button, Card, Container } from "react-bootstrap";
import api from "../../api/api.js";
import DataView from "../components/DataView.jsx";
import FileUploadButton from "../components/FileUploadButton.jsx";
import ApiUrlPage from "./ApiUrlPage.jsx";

function FileListPage() {
  const [showApiUrlPage, setShowApiUrlPage] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFetchFiles() {
    setLoading(true);
    setError("");

    try {
      setFiles(await api.listFiles());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  if (showApiUrlPage) {
    return <ApiUrlPage onBack={() => setShowApiUrlPage(false)} />;
  }

  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h4">Arquivos compartilhados</Card.Header>
        <Card.Header as="h7">{api.getSelectedApiUrl()}</Card.Header>
        <Card.Body>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => setShowApiUrlPage(true)}
            className="mb-3 me-2"
          >
            Configurar API
          </Button>
          <Button
            type="button"
            onClick={handleFetchFiles}
            disabled={loading}
            className="mb-3"
          >
            {loading ? "Carregando..." : "Buscar arquivos"}
          </Button>
          <FileUploadButton onUploaded={handleFetchFiles} />
          <DataView data={files} loading={loading} error={error} />
        </Card.Body>
      </Card>
    </Container>
  );
}

export default FileListPage;
