/**
 * The real Monaco editor, isolated in its own chunk.
 *
 * This module is only ever reached through the lazy import in EditorPanel, so
 * Monaco's ~1 MB of parse work happens after the page is already interactive.
 * Everything Monaco needs to exist before an <Editor> mounts is set up at
 * module scope here, which the dynamic import guarantees runs first.
 */
import { useRef, useCallback, useEffect, type RefObject } from "react";
import Editor, { loader, type BeforeMount, type OnMount } from "@monaco-editor/react";
import type { editor, MarkerSeverity } from "monaco-editor";
// Only the editor core API — skip built-in languages (TS/CSS/HTML/JSON) we
// don't use, since they pull in heavy language workers.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import type { LintIssue } from "../types/messages";

// Bundle Monaco from node_modules instead of @monaco-editor/react's default
// jsdelivr CDN. CDN load is blocked by our same-origin CSP (script-src 'self').
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};
loader.config({ monaco });

// Monarch tokenizer for ABAP syntax highlighting.
// Uses identifier-first matching with @keywords/@typeKeywords lookup
// instead of \b word boundaries, which break in Monarch because regexes
// are applied to remaining substrings (making \b match mid-identifier).
const ABAP_MONARCH_TOKENIZER = {
  defaultToken: "",
  ignoreCase: true,
  keywords: [
    "REPORT", "WRITE", "DATA", "TYPES", "CONSTANTS", "FIELD-SYMBOLS",
    "IF", "ELSE", "ELSEIF", "ENDIF", "DO", "ENDDO", "WHILE", "ENDWHILE",
    "LOOP", "ENDLOOP", "AT", "ENDAT", "CASE", "WHEN", "ENDCASE",
    "CLASS", "ENDCLASS", "METHOD", "ENDMETHOD", "FORM", "ENDFORM",
    "PERFORM", "FUNCTION", "ENDFUNCTION", "MODULE", "ENDMODULE",
    "TRY", "CATCH", "ENDTRY", "RAISE", "SELECT", "ENDSELECT",
    "INSERT", "UPDATE", "DELETE", "MODIFY", "APPEND", "READ", "TABLE",
    "INTO", "FROM", "WHERE", "AND", "OR", "NOT", "IS", "INITIAL",
    "BOUND", "ASSIGNED", "MOVE", "CLEAR", "FREE", "SORT", "DESCRIBE",
    "CALL", "RETURN", "EXPORTING", "IMPORTING", "CHANGING", "RECEIVING",
    "EXCEPTIONS", "CREATE", "OBJECT", "NEW", "VALUE", "REF",
    "CONV", "COND", "SWITCH", "CORRESPONDING", "REDUCE", "FILTER",
    "FOR", "IN", "THEN", "LET", "BASE", "LINES", "OF", "TYPE", "LIKE",
    "STANDARD", "SORTED", "HASHED", "ASSIGNING", "REFERENCE",
    "CONCATENATE", "CONDENSE", "TRANSLATE", "SHIFT", "REPLACE", "FIND",
    "SPLIT", "OVERLAY", "SEARCH", "STRLEN", "SUBSTRING", "TO",
    "UPPER", "LOWER", "USING", "KEY", "WITH", "INDEX", "TRANSPORTING",
    "NO", "FIELDS", "ABAP_TRUE", "ABAP_FALSE", "SY", "SYST", "ME",
    "SUPER", "BEGIN", "END", "DEFINITION", "IMPLEMENTATION", "PUBLIC",
    "PROTECTED", "PRIVATE", "SECTION", "METHODS", "RETURNING",
    "RAISING", "INHERITING", "INTERFACES", "ABSTRACT", "FINAL",
    "REDEFINITION", "DEFAULT",
  ],
  typeKeywords: [
    "STRING", "INT4", "INT8", "CHAR", "NUMC", "DATS", "TIMS",
    "DEC", "FLOAT", "XSTRING", "I", "C", "N", "D", "T", "F", "P", "X",
  ],
  tokenizer: {
    root: [
      [/^\*.*$/, "comment"],
      [/".*$/, "comment"],
      [/'[^']*'/, "string"],
      [/`[^`]*`/, "string"],
      // Match full identifiers (including SY-TABIX style), then classify
      [/[a-zA-Z_][\w-]*/, {
        cases: {
          "@keywords": "keyword",
          "@typeKeywords": "type",
          "@default": "",
        },
      }],
      [/\d+/, "number"],
      [/[{}()[\]]/, "delimiter.bracket"],
      [/[.,;:]/, "delimiter"],
      [/[-+*/=<>&]/, "operator"],
    ],
  },
};

export interface MonacoEditorProps {
  value: string;
  onChange: (value: string) => void;
  lintIssues: LintIssue[];
  /**
   * Where the caret sat in the skeleton, so the handoff keeps the user's place,
   * or undefined if they never touched it. Passed as a ref rather than a value
   * because it is only ever read inside onMount — reading it during render
   * would be reading a ref mid-render.
   */
  caretOffsetRef?: RefObject<number | undefined>;
}

export default function MonacoEditor({
  value,
  onChange,
  lintIssues,
  caretOffsetRef,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);

  const handleBeforeMount: BeforeMount = (monaco) => {
    monaco.languages.register({ id: "abap" });
    monaco.languages.setMonarchTokensProvider(
      "abap",
      ABAP_MONARCH_TOKENIZER as never,
    );
  };

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Carry the caret over from the textarea the user was just typing in.
    // Only then do we take focus: stealing it from a user who never touched the
    // editor would scroll the page to it unbidden.
    const caretOffset = caretOffsetRef?.current;
    if (caretOffset !== undefined) {
      const model = editor.getModel();
      if (model) {
        const position = model.getPositionAt(caretOffset);
        editor.setPosition(position);
        editor.revealPositionInCenterIfOutsideViewport(position);
      }
      editor.focus();
    }
  };

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? "");
    },
    [onChange],
  );

  // Update lint markers when issues change
  useEffect(() => {
    const monaco = monacoRef.current;
    const editorInstance = editorRef.current;
    if (monaco && editorInstance) {
      const model = editorInstance.getModel();
      if (model) {
        const severityMap: Record<string, MarkerSeverity> = {
          error: monaco.MarkerSeverity.Error,
          warning: monaco.MarkerSeverity.Warning,
          info: monaco.MarkerSeverity.Info,
        };
        monaco.editor.setModelMarkers(
          model,
          "abaplint",
          lintIssues.map((issue) => ({
            startLineNumber: issue.startLine,
            startColumn: issue.startCol,
            endLineNumber: issue.endLine,
            endColumn: issue.endCol,
            message: `[${issue.key}] ${issue.message}`,
            severity: severityMap[issue.severity] ?? monaco.MarkerSeverity.Info,
          })),
        );
      }
    }
  }, [lintIssues]);

  return (
    <Editor
      height="100%"
      language="abap"
      theme="vs-dark"
      value={value}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: "on",
        tabSize: 2,
      }}
    />
  );
}
