import FileListPage from "./pages/FileListPage.jsx";
import ApiUrlConfig from "./components/ApiUrlConfig.jsx";
import { ApiUrlProvider } from "./context/ApiUrlContext.jsx";

function App() {
  return (
    <ApiUrlProvider>
      <ApiUrlConfig />
      <FileListPage />
    </ApiUrlProvider>
  );
}

export default App;
