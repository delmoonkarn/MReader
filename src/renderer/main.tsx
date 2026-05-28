import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Gallery from "./pages/Gallery";
import FolderView from "./pages/FolderView";
import Reader from "./pages/Reader";

// We restore scroll positions manually via useScrollRestore.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/folder/:id" element={<FolderView />} />
        <Route path="/read/:id" element={<Reader />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
