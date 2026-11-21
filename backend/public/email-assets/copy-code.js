(function () {
  // The code is in the URL fragment (#123456); browsers never send the fragment to a server.
  var code = (window.location.hash || '').replace(/\D/g, '').slice(0, 6);
  var digits = document.getElementById('digits');
  var panel = document.getElementById('panel');
  var btn = document.getElementById('copy');
  var intro = document.getElementById('intro');
  var hint = document.getElementById('hint');
  var error = document.getElementById('error');

  if (code.length !== 6) {
    panel.hidden = true;
    intro.hidden = true;
    hint.hidden = true;
    error.hidden = false;
    return;
  }

  code.split('').forEach(function (d) {
    var cell = document.createElement('div');
    cell.className = 'digit';
    cell.textContent = d;
    digits.appendChild(cell);
  });

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function markCopied() {
    btn.classList.add('done');
    btn.textContent = '\u2713 Copied';
    hint.textContent = 'Now go back to your vendor application and paste the code.';
  }

  btn.addEventListener('click', function () {
    if (btn.classList.contains('done')) return;
    copyText(code).then(function (ok) {
      if (ok) {
        markCopied();
      } else {
        btn.textContent = 'Press Ctrl+C to copy';
      }
    });
  });

  // The visitor already pressed "Copy Code" in the mail, so copy straight away on arrival. If the browser
  // refuses (it wants a click on this page), the button above still works.
  copyText(code).then(function (ok) { if (ok) markCopied(); });
})();
