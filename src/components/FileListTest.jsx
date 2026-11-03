import { useEffect, useState } from "react";
import { Alert, Card, Container, ListGroup, Spinner } from "react-bootstrap";
import { listFiles } from "../../api/list.js";

function FileListTest() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    listFiles()
      .then((result) => {
        if (active) {
          setFiles(result);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <Container className="py-4">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Carregando arquivos...</span>
        </Spinner>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="py-4">
        <Alert variant="danger" role="alert">
          Erro: {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <Card>
        <Card.Header as="h1">Arquivos compartilhados</Card.Header>
        {files.length === 0 ? (
          <Card.Body>
            <Card.Text>Nenhum arquivo encontrado.</Card.Text>
          </Card.Body>
        ) : (
          <ListGroup variant="flush">
            {files.map((filename) => (
              <ListGroup.Item key={filename}>{filename}</ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card>
    </Container>
  );
}

export default FileListTest;
