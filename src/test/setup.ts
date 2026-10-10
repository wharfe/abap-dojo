// Registers the DOM matchers (toBeInTheDocument, toHaveAttribute, ...) for
// every Vitest file. src/test/jest-dom.test.ts fails if this stops running.
import "@testing-library/jest-dom/vitest";
