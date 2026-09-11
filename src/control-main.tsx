import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./Control.css";
import ControlApp from "./ControlApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>
);
