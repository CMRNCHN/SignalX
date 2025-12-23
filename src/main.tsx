import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Mount the React application to the DOM.  The id "root" is defined in
// index.html which Vite injects into the Tauri window.  React 18's
// createRoot API is used for concurrent rendering.
const container = document.getElementById("root");
const root = ReactDOM.createRoot(container!);
root.render(<App />);