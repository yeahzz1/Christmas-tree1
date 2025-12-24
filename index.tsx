import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode can double-init Three.js in dev, but our cleanup in useEffect handles it.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
