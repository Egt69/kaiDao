// @ts-nocheck
// Safe counterpart to ../dangerous/unsafe.tsx. Every line here is either the
// correct way to do the dangerous thing, or prose that only looks like code.
// scanRepository() must report nothing for this folder.
//
// Prose can mention eval(value) or dangerouslySetInnerHTML without tripping the
// guard, because comments are stripped before matching. Strings are not
// stripped, so a label that really contains the text needs a marker:
const label = "eval("; // safety-check: ignore no-eval — a button label, never called

export function Safe({ href, src, description }: { href: string; src: string; description: string }) {
  // A dynamic href goes through safeUrl() on the same line, and a new tab
  // always drops the opener.
  const links = (
    <div>
      <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">external</a>
      <a
        href={safeUrl(href)}
        target="_blank"
        rel="noreferrer noopener"
        className="formatted one attribute per line"
      >
        external, formatted the way Prettier does it
      </a>
      <a href={safeUrl(`/proposals/${description}`)}>internal</a>
      <img src={safeUrl(src)} alt="" />
      <a href="/stake">literal path</a>
      <a href="https://retium.net">literal https</a>
    </div>
  );

  // Text is set as text, never parsed.
  element.textContent = description;
  element.textContent = label;
  const isFunction = typeof description === "function";
  const png = "data:image/png;base64,iVBORw0KGgo=";

  // Timers get a function, so nothing can be compiled from a string.
  setTimeout(() => refresh(), 1000);
  setInterval(function tick() {}, 30_000);

  return (
    <p className="break-words" title={description}>
      {description}
      {isFunction}
      {png}
      {links}
    </p>
  );
}
