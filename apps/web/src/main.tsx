import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter'; // self-hosted font, no third-party request (DS §4.1, NFR-PRIV-01)
import './index.css';
import { App } from './app/App.tsx';

const root = createRoot(document.getElementById('root')!);

// Restore the local project before the first render so the user lands where they left off (NFR-REL).
// Persistence (Dexie + zod validation of stored data) is a separate chunk so the entry bundle stays
// small; the import worker and exporters are loaded only when used (DEC-044).
import('./persistence/db.ts')
  .then(async ({ hydrateFromStorage, startAutosave }) => {
    await hydrateFromStorage();
    startAutosave();
  })
  .catch(() => undefined) // storage unavailable: the app still works in memory
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
