
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("No se pudo encontrar el elemento root");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Error durante el renderizado inicial:", error);
    rootElement.innerHTML = `<div style="padding: 20px; color: red;">Error al cargar la aplicación. Revisa la consola.</div>`;
  }
}
