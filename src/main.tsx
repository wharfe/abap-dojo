import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './index.css'
import App from './App.tsx'

// @abaplint/core uses Buffer.from(...) for built-in constants. It has to be in
// place before anything imports abaplint, which is why it stays in the entry
// chunk rather than moving with Monaco.
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

// Monaco's setup (loader.config, MonacoEnvironment) moved into
// components/MonacoEditor.tsx so it ships in that component's lazy chunk
// instead of blocking the entry chunk. See components/EditorPanel.tsx.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
