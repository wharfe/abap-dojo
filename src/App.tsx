import { useState } from "react";
import { EditorPanel } from "./components/EditorPanel";

const DEFAULT_CODE = `REPORT ztest.
WRITE 'Hello, ABAP Dojo!'.`;

function App() {
  const [source, setSource] = useState(DEFAULT_CODE);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-bold tracking-wide">ABAP Dojo</h1>
      </header>
      <main className="flex-1 min-h-0">
        <EditorPanel value={source} onChange={setSource} lintIssues={[]} />
      </main>
    </div>
  );
}

export default App;
