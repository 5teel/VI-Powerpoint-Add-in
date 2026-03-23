import React from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import App from "./components/App";
import "./taskpane.css";

/* global Office */

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    const container = document.getElementById("container");
    if (container) {
      const root = createRoot(container);
      root.render(
        <FluentProvider theme={webLightTheme}>
          <App />
        </FluentProvider>
      );
    }
  }
});
