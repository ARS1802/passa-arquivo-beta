import { useEffect, useRef, useState } from "react";
import { Alert, Button, Form, InputGroup } from "react-bootstrap";
import fetcher from "../../../controller/fetchers/Fetcher.js";

function ApiUrlConfig() {
  const discoveryController = useRef(null);
  useEffect(() => () => discoveryController.current?.abort(), []);

  const [peers, setPeers] = useState([]);
  const [selectedId, setSelectedId] = useState(fetcher.targetPeer?.id || "");
  const [feedback, setFeedback] = useState("");
  const [feedbackVariant, setFeedbackVariant] = useState("danger");
  const [busy, setBusy] = useState(true);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    if (!discovering) return;
    let active = true;
    let timer;

    async function refreshPeers() {
      try {
        const saved = await fetcher.getPeer();
        if (active) setPeers(saved);
      } catch (error) {
        if (active) {
          setFeedbackVariant("danger");
          setFeedback(error.message);
        }
      } finally {
        // Aguarda a consulta terminar para não acumular requisições lentas.
        if (active) timer = setTimeout(refreshPeers, 1000);
      }
    }

    refreshPeers();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [discovering]);

  useEffect(() => {
    let active = true;
    fetcher.getPeer()
      .then((saved) => { if (active) setPeers(saved); })
      .catch((error) => { if (active) setFeedback(error.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function handleSelect(id) {
    setBusy(true);
    setFeedback("");
    try {
      const peer = await fetcher.selectPeer({ id });
      setSelectedId(peer.id);
    } catch (error) {
      setFeedbackVariant("danger");
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id) {
    setBusy(true);
    setFeedback("");
    try {
      await fetcher.deletePeer(id);
      setPeers((saved) => saved.filter((peer) => peer.id !== id));
      setSelectedId(fetcher.targetPeer?.id || "");
      setFeedbackVariant("success");
      setFeedback("Peer excluído.");
    } catch (error) {
      setFeedbackVariant("danger");
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscovery() {
    const controller = new AbortController();
    discoveryController.current = controller;
    setBusy(true);
    setDiscovering(true);
    setFeedback("");
    try {
      const found = await fetcher.discoverPeers({ signal: controller.signal });
      setDiscovering(false);
      setPeers(await fetcher.getPeer());
      setFeedbackVariant(controller.signal.aborted ? "info" : found.length ? "success" : "warning");
      setFeedback(controller.signal.aborted
        ? "Busca interrompida. Os Peers já salvos foram preservados."
        : found.length
        ? `${found.length} Peer(s) encontrado(s) na rede. Selecione o dispositivo desejado.`
        : "Nenhum Peer disponível foi encontrado na rede.");
    } catch (error) {
      setFeedbackVariant("danger");
      setFeedback(error.message);
    } finally {
      setDiscovering(false);
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <fieldset disabled={busy}>
        <legend className="fs-6">Dispositivo para compartilhar arquivos</legend>
        {!busy && peers.length === 0 && <p>Nenhum Peer salvo. Procure dispositivos na rede.</p>}
        {peers.map((peer) => (
          <InputGroup key={peer.id} className="mb-2">
            <Form.Check
              id={`peer-${peer.id}`}
              type="radio"
              name="target-peer"
              label={`${peer.nome} (${peer.ip})`}
              checked={selectedId === peer.id}
              onChange={() => handleSelect(peer.id)}
              className="flex-grow-1"
            />
            <Button
              type="button"
              variant="danger"
              onClick={() => handleRemove(peer.id)}
              aria-label={`Excluir ${peer.nome}`}
            >
              Excluir
            </Button>
          </InputGroup>
        ))}
        <Button type="button" variant="outline-secondary" onClick={handleDiscovery} className="mt-2">
          {busy ? "Aguarde..." : "Procurar Peers na rede"}
        </Button>
      </fieldset>
      {discovering && (
        <Button type="button" variant="outline-danger" className="mt-2" onClick={() => discoveryController.current?.abort()}>
          Interromper busca
        </Button>
      )}
      {feedback && <Alert variant={feedbackVariant} className="mt-2 mb-0">{feedback}</Alert>}
    </div>
  );
}

export default ApiUrlConfig;
