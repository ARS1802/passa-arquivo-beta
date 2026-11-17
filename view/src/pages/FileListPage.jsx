import { useState } from "react";
import { Button, Card, Container } from "react-bootstrap";
import api from "../../../controller/fetchers/API.js";
import DataView from "../components/DataView.jsx";
import FileUploadButton from "../components/FileUploadButton.jsx";
import ApiUrlPage from "./ApiUrlPage.jsx";
import SelectDir from "./SelectDir.jsx";

function FileListPage() {
  const [showApiUrlPage, setShowApiUrlPage] = useState(false);
  const [showSelectDir, setShowSelectDir] = useState(true);
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

  if (showSelectDir) {
    return <SelectDir onBack={() => setShowSelectDir(false)} />;
  }

  if (showApiUrlPage) {
    return <ApiUrlPage onBack={() => setShowApiUrlPage(false)} />;
  }

  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h4">Arquivos compartilhados</Card.Header>
        <Card.Header>
          {api.targetPeer ? `${api.targetPeer.nome} — ${api.targetPeerURL}` : "Selecione um Peer para acessar os arquivos."}
        </Card.Header>
        <Card.Body>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => {
              setFiles([]);
              setError("");
              setShowSelectDir(true);
            }}
            disabled={loading}
            className="mb-3 me-2"
          >
            Diretório compartilhado
          </Button>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => {
              // Arquivos do alvo anterior não podem aparecer como se fossem do novo.
              setFiles([]);
              setError("");
              setShowApiUrlPage(true);
            }}
            disabled={loading}
            className="mb-3 me-2"
          >
            Selecionar Peer
          </Button>
          <Button
            type="button"
            onClick={handleFetchFiles}
            disabled={loading || !api.targetPeer}
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
