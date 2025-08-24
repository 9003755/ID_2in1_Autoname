import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";

// 获取basename，在GitHub Pages部署时使用仓库名，本地开发时为空
const basename = import.meta.env.PROD ? '/ID_2in1_Autoname' : '/ID_2in1_Autoname';

export default function App() {
  return (
    <Router basename={basename}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/other" element={<div className="text-center text-xl">Other Page - Coming Soon</div>} />
      </Routes>
    </Router>
  );
}
