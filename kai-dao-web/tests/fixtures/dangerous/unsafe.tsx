// @ts-nocheck
// Deliberately unsafe. The guard's own test points scanRepository() at this
// folder and expects one finding for every rule in scripts/check-dangerous-patterns.mjs.
// Never import this file, never copy a line out of it.

export function Dangerous({ html, url, value }: { html: string; url: string; value: string }) {
  const target = {
    __html: html,
  };

  const script = "java" + "script:alert(1)";
  const document = "data:text/html,<script>alert(1)</script>";

  element.innerHTML = html;
  element.outerHTML = html;
  element["innerHTML"] = html;
  element.insertAdjacentHTML("beforeend", html);
  window.document.write(html);
  window.document.writeln(html);
  range.createContextualFragment(html);
  eval(value);
  window["eval"](value);
  const a = new Function(value);
  const b = new globalThis.Function(value);
  const c = Function(value);
  setTimeout("alert(1)", 10);
  setInterval(`alert(1)`, 10);
  setTimeout(handler, 10);

  return (
    <div>
      <div dangerouslySetInnerHTML={target} />
      <a href={url} target="_blank">
        no rel
      </a>
      <a href={value}>dynamic without safeUrl</a>
      <iframe srcDoc={html} />
      <iframe srcdoc={html} />
      <a href="javascript:alert(1)">script url</a>
      <a href="data:text/html,<b>x</b>">data url</a>
      {script}
      {document}
    </div>
  );
}
