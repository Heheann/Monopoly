import { Link, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { GamePage } from "./pages/GamePage";
import { ResultPage } from "./pages/ResultPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<GamePage />} />
      <Route path="/result" element={<ResultPage />} />
      <Route
        path="/admin"
        element={
          <>
            <header className="top-nav">
              <h1>高雄景點大富翁管理後台</h1>
              <Link className="nav-link" to="/">
                回遊戲
              </Link>
            </header>
            <AdminPage />
          </>
        }
      />
    </Routes>
  );
}

export default App;
