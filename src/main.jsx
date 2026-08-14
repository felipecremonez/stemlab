import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const url = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(url).catch((error) => console.warn('PWA:', error));
  });
}
