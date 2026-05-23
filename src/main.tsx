import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import { loader } from '@monaco-editor/react'
// Only the editor core API — skip built-in languages (TS/CSS/HTML/JSON) we
// don't use, since they pull in heavy language workers.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import './index.css'
import App from './App.tsx'

// @abaplint/core uses Buffer.from(...) for built-in constants.
;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer

// Bundle Monaco from node_modules instead of @monaco-editor/react's default
// jsdelivr CDN. CDN load is blocked by our same-origin CSP (script-src 'self').
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}
loader.config({ monaco })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
