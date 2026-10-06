(() => {
  const $ = (id) => document.getElementById(id);
  const pw = $("pw"), reveal = $("reveal"), form = $("form"), go = $("go"), core = $("core");

  reveal.addEventListener("click", () => {
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    reveal.textContent = show ? "Hide" : "Show";
    reveal.setAttribute("aria-pressed", show);
    reveal.setAttribute("aria-label", show ? "Hide access code" : "Show access code");
    pw.focus();
  });

  form.addEventListener("submit", () => {
    go.disabled = true;
    go.textContent = "Authenticating…";
    core.classList.add("thinking");
  });
  // Coming back with the Back button should not leave the button stuck.
  addEventListener("pageshow", () => {
    go.disabled = false;
    go.textContent = "Authenticate";
    core.classList.remove("thinking");
  });

  // On phones, focusing at once would throw the keyboard over the reactor.
  if (matchMedia("(pointer: fine)").matches) pw.focus();
})();
