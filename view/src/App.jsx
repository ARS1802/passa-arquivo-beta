import { useEffect, useState } from "react";
import { Alert, Button, Container } from "react-bootstrap";
import fetcher from "../../controller/fetchers/Fetcher.js";
import FileListPage from "./pages/FileListPage.jsx";
import NamingScreen from "./pages/NamingScreen.jsx";

function App() {
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetcher.getLocalIdentity()
      .then((saved) => { if (active) setIdentity(saved); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  if (loading || error) {
    return (
      <Container className="py-4">
        {loading ? <p role="status">Consultando a identidade deste computador...</p> : <>
          <Alert variant="danger">{error}</Alert>
          <Button type="button" onClick={() => {
            setLoading(true);
            setError("");
            setAttempt((value) => value + 1);
          }}>Tentar novamente</Button>
        </>}
      </Container>
    );
  }

  // Sem nome confirmado pelo fetcher, nenhuma das outras telas fica disponível.
  if (!identity?.nome?.trim()) {
    return <NamingScreen onSaved={setIdentity} />;
  }

  return <FileListPage localName={identity.nome} onNamed={setIdentity} />;
}

export default App;
