import React from 'react';
import { createRoot } from 'react-dom/client';
import MovementEchoes from '../MovementEchoes';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MovementEchoes />
  </React.StrictMode>,
);
