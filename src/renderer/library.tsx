import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Library } from "./library/Library.js";
import "./styles.css";
import "./library/library.css";

const root = document.getElementById("root");
if (root === null) throw new Error("No #root found in library.html");

createRoot(root).render(
  <StrictMode>
    <Library />
  </StrictMode>,
);
