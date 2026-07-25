import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capture } from "./Capture.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("No #root found in index.html");

createRoot(root).render(
  <StrictMode>
    <Capture />
  </StrictMode>,
);
