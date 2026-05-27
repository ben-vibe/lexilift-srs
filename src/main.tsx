import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "react-day-picker/dist/style.css";
import App from "./App";
import { requestPersistentStorage } from "./lib/storagePersistence";

void requestPersistentStorage().then((status) => {
  if (import.meta.env.DEV) {
    console.info("[LexiLift] Persistent storage:", status);
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.log("Service Worker registration failed:", error));
  });
}
