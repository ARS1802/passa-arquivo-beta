import { Alert, Col, ListGroup, Row, Spinner } from "react-bootstrap";
import api from "../../../controller/fetchers/API.js";
import FileItem from "./FileItem.jsx";

function DataView({ data, loading, error }) {
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

  if (data.length === 0) {
    return <Alert variant="secondary">Nenhum arquivo encontrado.</Alert>;
  }

  return (
    <ListGroup>
      <ListGroup.Item className="fw-bold">
        <Row>
          <Col>Nome</Col>
          <Col>Tamanho</Col>
          <Col>Última modificação</Col>
          <Col>MIME type</Col>
        </Row>
      </ListGroup.Item>
      {data.map((file) => (
        <FileItem
          key={file.filename}
          file={file}
          onClick={() => api.downloadFile(file.filename)}
        />
      ))}
    </ListGroup>
  );
}

export default DataView;
