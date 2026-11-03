import { Col, ListGroup, Row } from "react-bootstrap";

function FileItem({ file, onClick }) {
  return (
    <ListGroup.Item action as="button" type="button" onClick={onClick}>
      <Row>
        <Col>{file.filename}</Col>
        <Col>{file.size} bytes</Col>
        <Col>{file.lastModified}</Col>
        <Col>{file.mimeType}</Col>
      </Row>
    </ListGroup.Item>
  );
}

export default FileItem;
