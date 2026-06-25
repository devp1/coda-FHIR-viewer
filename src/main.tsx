import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FhirChartProofClient } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* The viewer is identical to the in-app version; this is just the standalone host page. */}
    <FhirChartProofClient />
  </StrictMode>,
);
