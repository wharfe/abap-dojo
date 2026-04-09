const NAV_LINKS = [
  { label: "Guides", href: "/docs/index.html" },
  { label: "AI Pitfalls", href: "/docs/index.html#pitfalls" },
  { label: "About", href: "/docs/about.html" },
  { label: "GitHub", href: "https://github.com/wharfe/abap-dojo", external: true },
] as const;

// Direct links to individual content pages. Improves crawl discoverability and
// provides keyword-rich anchor text for SEO.
const CONTENT_LINKS = [
  { label: "ABAP Internal Tables", href: "/docs/guides/internal-tables.html" },
  { label: "String Processing", href: "/docs/guides/string-processing.html" },
  { label: "Modern ABAP Syntax", href: "/docs/guides/modern-syntax.html" },
  { label: "STRING vs CHAR Confusion", href: "/docs/pitfalls/string-char-confusion.html" },
  { label: "Python-Style Loop Patterns", href: "/docs/pitfalls/python-loop-pattern.html" },
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
