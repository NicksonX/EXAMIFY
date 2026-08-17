import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "@/context/AuthContext";
import { AccountStateProvider } from "@/context/AccountStateContext";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <AccountStateProvider>
            <App />
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  border: "1px solid rgba(20, 39, 74, 0.18)",
                  borderRadius: "2px",
                  background: "#fffdfa",
                  boxShadow: "4px 4px 0 #ce4040",
                  color: "#14274a",
                  fontFamily: "Manrope, system-ui, sans-serif",
                  fontSize: "14px",
                },
              }}
            />
          </AccountStateProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
