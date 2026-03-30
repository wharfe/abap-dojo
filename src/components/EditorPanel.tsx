import { useRef, useCallback } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import type { editor, MarkerSeverity } from "monaco-editor";
import type { LintIssue } from "../types/messages";

const ABAP_MONARCH_TOKENIZER = {
  defaultToken: "",
  ignoreCase: true,
  tokenizer: {
    root: [
      [/^\*.*$/, "comment"],
      [/".*$/, "comment"],
      [/'[^']*'/, "string"],
      [/`[^`]*`/, "string"],
      [
        /\b(REPORT|WRITE|DATA|TYPES|CONSTANTS|FIELD-SYMBOLS|IF|ELSE|ELSEIF|ENDIF|DO|ENDDO|WHILE|ENDWHILE|LOOP|ENDLOOP|AT|ENDAT|CASE|WHEN|ENDCASE|CLASS|ENDCLASS|METHOD|ENDMETHOD|FORM|ENDFORM|PERFORM|FUNCTION|ENDFUNCTION|MODULE|ENDMODULE|TRY|CATCH|ENDTRY|RAISE|SELECT|ENDSELECT|INSERT|UPDATE|DELETE|MODIFY|APPEND|READ|TABLE|INTO|FROM|WHERE|AND|OR|NOT|IS|INITIAL|BOUND|ASSIGNED|MOVE|CLEAR|FREE|SORT|DESCRIBE|CALL|RETURN|EXPORTING|IMPORTING|CHANGING|RECEIVING|EXCEPTIONS|CREATE|OBJECT|NEW|VALUE|REF|CONV|COND|SWITCH|CORRESPONDING|REDUCE|FILTER|FOR|IN|THEN|LET|BASE|LINES|OF|TYPE|LIKE|STANDARD|SORTED|HASHED|ASSIGNING|REFERENCE|CONCATENATE|CONDENSE|TRANSLATE|SHIFT|REPLACE|FIND|SPLIT|OVERLAY|SEARCH|STRLEN|SUBSTRING|TO|UPPER|LOWER|USING|KEY|WITH|INDEX|TRANSPORTING|NO|FIELDS|ABAP_TRUE|ABAP_FALSE|SY|SYST|ME|SUPER)\b/,
        "keyword",
      ],
      [/\b(STRING|INT4|INT8|CHAR|NUMC|DATS|TIMS|DEC|FLOAT|XSTRING|I|C|N|D|T|F|P|X)\b/, "type"],
      [/\b\d+\b/, "number"],
      [/[{}()[\]]/, "delimiter.bracket"],
      [/[.,;:]/, "delimiter"],
      [/[-+*/=<>&]/, "operator"],
    ],
  },
};

interface EditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  lintIssues: LintIssue[];
}

export function EditorPanel({ value, onChange, lintIssues }: EditorPanelProps) {
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
  };

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? "");
    },
    [onChange],
  );

  // Update lint markers when issues change
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
