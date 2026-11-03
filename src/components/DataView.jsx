import { Alert, ListGroup, Spinner } from "react-bootstrap";

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
      {data.map((file) => (
        <ListGroup.Item key={file.filename}>{file.filename}</ListGroup.Item>
      ))}
    </ListGroup>
  );
}

export default DataView;
