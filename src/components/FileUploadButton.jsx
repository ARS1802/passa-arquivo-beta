import { useRef, useState } from "react";
import { Alert, Button } from "react-bootstrap";
import api from "../../api/api.js";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function FileUploadButton({ onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function handleButtonClick() {
    inputRef.current?.click();
  }

  async function handleFileChange(event) {
    const [file] = event.target.files;
    event.target.value = "";

    if (!file) {
      return;
    }

    setUploading(true);
    setError("");

    try {
      await api.uploadFile({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        data: arrayBufferToBase64(await file.arrayBuffer()),
      });
      onUploaded?.();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="success"
        onClick={handleButtonClick}
        disabled={uploading}
        className="mb-3 ms-2"
      >
        {uploading ? "Enviando..." : "Enviar arquivo"}
      </Button>
      <input
        ref={inputRef}
        type="file"
        onChange={handleFileChange}
        hidden
      />
      {error && <Alert variant="danger">{error}</Alert>}
    </>
  );
}

export default FileUploadButton;
