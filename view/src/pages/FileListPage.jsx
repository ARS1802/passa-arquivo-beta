import { useState } from "react";
import { Button, Card, Container } from "react-bootstrap";
import api from "../../../controller/fetchers/API.js";
import DataView from "../components/DataView.jsx";
import FileUploadButton from "../components/FileUploadButton.jsx";
import ApiUrlPage from "./ApiUrlPage.jsx";
import SelectDir from "./SelectDir.jsx";
import NamingScreen from "./NamingScreen.jsx";

function FileListPage({ localName, onNamed }) {
  const [showApiUrlPage, setShowApiUrlPage] = useState(false);
  const [showSelectDir, setShowSelectDir] = useState(true);
  const [showNaming, setShowNaming] = useState(false);
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

  if (showNaming) {
    return <NamingScreen
      initialName={localName}
      onSaved={(identity) => { onNamed(identity); setShowNaming(false); }}
      onBack={() => setShowNaming(false)}
    />;
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
          <p>Este computador: <strong>{localName}</strong></p>
          <Button
            type="button"
            variant="outline-secondary"
            onClick={() => setShowNaming(true)}
            disabled={loading}
            className="mb-3 me-2"
          >
            Alterar meu nome
          </Button>
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
