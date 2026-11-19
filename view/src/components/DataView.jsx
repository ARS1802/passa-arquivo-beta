import { Alert, Col, ListGroup, Row, Spinner } from "react-bootstrap";
import FileItem from "./FileItem.jsx";

function DataView({ data, directories, loading, error, onOpenDirectory, onDownload }) {
  if (loading) {
    return (
      <div className="text-center p-4">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Carregando...</span>
        </Spinner>
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger">{error}</Alert>;
  }

  if (data.length === 0 && directories.length === 0) {
    return <Alert variant="secondary">Nenhum arquivo ou diretório encontrado.</Alert>;
  }

  return (
    <ListGroup>
      <ListGroup.Item className="fw-bold">
        <Row>
          <Col>Nome</Col>
          <Col>Tamanho</Col>
          <Col>Última modificação</Col>
          <Col>Tipo</Col>
        </Row>
      </ListGroup.Item>
      {directories.map((directory) => (
        <ListGroup.Item
          key={`directory:${directory.name}`}
          action
          as="button"
          type="button"
          onClick={() => onOpenDirectory(directory.name)}
        >
          <Row>
            <Col>{directory.name}/</Col>
            <Col>—</Col>
            <Col>—</Col>
            <Col>Pasta</Col>
          </Row>
        </ListGroup.Item>
      ))}
      {data.map((file) => (
        <FileItem
          key={file.filename}
          file={file}
          onClick={() => onDownload(file.filename)}
        />
      ))}
    </ListGroup>
  );
}

export default DataView;
