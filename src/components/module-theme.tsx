/**
 * Per-module colour, from the logo's three colours, so each module feels like
 * its own place (see the "module colours" decision):
 *
 * - billing (Billing, Accounting, Inventory): green, the app's default primary.
 * - hr (HRMS, Leave, Team): amber, on accents AND the module's main buttons.
 * - tasks (Task delegation): red as a light tint and on icons only. Its buttons
 *   stay green, because red already means errors, overdue and Delete.
 *
 * Wrap a module's layout in it:
 *
 *   <ModuleTheme module="hr">{children}</ModuleTheme>
 *
 * Inside, every shadcn part that reads --primary / --ring (buttons, focus
 * rings, tabs, toggles, checkboxes) takes the module's colour with no change to
 * the components. For the module's own accents use the --module-* variables:
 *
 *   text-(--module-accent)       icons, the active tab's line, a heading strip
 *   bg-(--module-tint)           icon chips, a soft header band
 *   bg-(--module-accent)         a solid accent bar
 *
 * The rules ship as a hoisted <style> (React dedupes it by href), not a .css
 * file: this project sends every .css file through the Tailwind loader.
 */

export type ModuleName = "billing" | "hr" | "tasks";

// Contrast checked: white on #9a6416 is 4.99:1 (the logo's #c2862e is only 3.11:1,
// so it stays for icons and tints, never under white text). Dark mode flips to a
// light amber with black text (9.4:1).
const MODULE_THEME_CSS = `
[data-module] {
  --module-accent: #04875a;
  --module-tint: rgb(4 135 90 / 0.1);
}
[data-module="hr"] {
  --primary: #9a6416;
  --primary-foreground: #ffffff;
  --ring: #c2862e;
  --module-accent: #9a6416;
  --module-tint: rgb(194 134 46 / 0.15);
}
[data-module="tasks"] {
  --module-accent: #ae1e2a;
  --module-tint: rgb(174 30 42 / 0.1);
}
.dark [data-module] {
  --module-accent: #1fa673;
  --module-tint: rgb(31 166 115 / 0.16);
}
.dark [data-module="hr"] {
  --primary: #e0a24a;
  --primary-foreground: #000000;
  --ring: #e0a24a;
  --module-accent: #e0a24a;
  --module-tint: rgb(224 162 74 / 0.16);
}
.dark [data-module="tasks"] {
  --module-accent: #e0606a;
  --module-tint: rgb(224 96 106 / 0.16);
}
`;

export function ModuleTheme({
  module,
  className,
  children,
}: {
  module: ModuleName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <style href="module-themes" precedence="medium">
        {MODULE_THEME_CSS}
      </style>
      <div data-module={module} className={className}>
        {children}
      </div>
    </>
  );
}
