import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter'; // self-hosted font, no third-party request (DS §4.1, NFR-PRIV-01)
import './index.css';
import { App } from './app/App.tsx';
import { hydrateFromStorage, startAutosave } from './persistence/db.ts';

const root = createRoot(document.getElementById('root')!);

// Restore the local project before the first render so the user lands where they left off (NFR-REL).
hydrateFromStorage().finally(() => {
  startAutosave();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
