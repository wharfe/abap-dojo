// Hrefs are extensionless: Cloudflare Pages 308-redirects /x.html to /x, so
// linking the .html form costs every visitor a redirect hop and points crawlers
// at a URL that is not the canonical one. See CLAUDE.md, Known Gotchas.
const NAV_LINKS = [
  { label: "What runs here", href: "/abap-online-compiler" },
  { label: "Editor features", href: "/online-abap-editor" },
  { label: "Check AI output", href: "/validate-ai-generated-abap" },
  { label: "Practice without SAP", href: "/practice-abap-without-sap" },
  { label: "Guides", href: "/docs/" },
  { label: "AI Pitfalls", href: "/docs/#pitfalls" },
  { label: "About", href: "/docs/about" },
  { label: "GitHub", href: "https://github.com/wharfe/abap-dojo", external: true },
] as const;

// Direct links to every content page. This is the strongest discovery signal we
// have: "/" holds essentially all of the site's search authority, so a page not
// linked from here is one a crawler may not find for weeks. Keep it complete
// whenever a page is added under public/docs.
const CONTENT_LINKS = [
  { label: "Variables & Conditions", href: "/docs/guides/variables-conditions" },
  { label: "ABAP Internal Tables", href: "/docs/guides/internal-tables" },
  { label: "String Processing", href: "/docs/guides/string-processing" },
  { label: "Classes & Methods", href: "/docs/guides/oo-basics" },
  { label: "Modern ABAP Syntax", href: "/docs/guides/modern-syntax" },
  { label: "STRING vs CHAR Confusion", href: "/docs/pitfalls/string-char-confusion" },
  { label: "Python-Style Loop Patterns", href: "/docs/pitfalls/python-loop-pattern" },
  { label: "Untyped Declarations", href: "/docs/pitfalls/dynamic-typing" },
  { label: "Hallucinated Class Names", href: "/docs/pitfalls/hallucinated-class" },
] as const;

export function AppFooter() {
  return (
    <footer className="px-4 py-3 bg-gray-800 border-t border-gray-700 text-center text-xs text-gray-500">
      <nav className="flex flex-wrap justify-center gap-3 mb-1.5">
        {NAV_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={"external" in link ? "_blank" : undefined}
            rel={"external" in link ? "noopener noreferrer" : undefined}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            {link.label}
          </a>
        ))}
      </nav>
      <nav
        aria-label="Learn ABAP"
        className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-1.5 text-gray-500"
      >
        <span className="text-gray-600">Learn:</span>
        {CONTENT_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="hover:text-gray-300 transition-colors"
          >
            {link.label}
          </a>
        ))}
      </nav>
      <p>
        © 2026 ABAP Dojo — Browser-based ABAP Playground. Powered by{" "}
        <a
          href="https://abaplint.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-200"
        >
          abaplint
        </a>
        .
      </p>
    </footer>
  );
}
