import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Pannellum from "./elements/Pannellum";
import PannellumVideo from "./elements/PannellumVideo";

// For standalone app mode
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// For library exports
export {
  Pannellum,
  PannellumVideo
};
