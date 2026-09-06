import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SignalXProvider } from "./context/SignalXContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <SignalXProvider>
        <App />
      </SignalXProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
