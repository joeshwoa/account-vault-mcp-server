export const PAGE_HTML = "<!doctype html>\n" +
'<html lang="en">\n' +
"<head>\n" +
'<meta charset="utf-8" />\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
"<title>Account Vault</title>\n" +
"<style>\n" +
"  :root {\n" +
"    color-scheme: light dark;\n" +
"    --bg: #f7f7f8; --card: #ffffff; --border: #e3e3e6; --text: #1c1c1f;\n" +
"    --muted: #6b6b73; --accent: #2563eb; --accent-hover: #1d4ed8; --danger: #dc2626; --ok: #16a34a;\n" +
"  }\n" +
"  @media (prefers-color-scheme: dark) {\n" +
"    :root { --bg: #16161a; --card: #1f1f24; --border: #2c2c33; --text: #f0f0f2; --muted: #9a9aa2; }\n" +
"  }\n" +
"  * { box-sizing: border-box; }\n" +
"  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;\n" +
"    background: var(--bg); color: var(--text); line-height: 1.5; }\n" +
"  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }\n" +
"  h1 { font-size: 22px; margin: 0 0 4px; }\n" +
"  h2 { font-size: 16px; margin: 0 0 4px; }\n" +
"  .sub { color: var(--muted); margin: 0 0 28px; font-size: 14px; }\n" +
"  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }\n" +
"  .desc { color: var(--muted); font-size: 13px; margin: 0 0 10px; }\n" +
"  .account-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--border); }\n" +
"  .account-row:first-of-type { border-top: none; }\n" +
"  .who .label { font-weight: 600; font-size: 14px; }\n" +
"  .who .email { color: var(--muted); font-size: 13px; }\n" +
"  button, input { font: inherit; border-radius: 8px; border: 1px solid var(--border); }\n" +
"  input { padding: 8px 10px; background: transparent; color: var(--text); width: 100%; }\n" +
"  button { padding: 8px 14px; background: var(--accent); color: #fff; border: none; cursor: pointer; font-weight: 500; }\n" +
"  button:hover { background: var(--accent-hover); }\n" +
"  button.danger { background: transparent; color: var(--danger); border: 1px solid var(--border); }\n" +
"  button.copy-btn { background: transparent; color: var(--text); border: 1px solid var(--border); padding: 4px 8px; font-size: 12px; position: absolute; top: 8px; right: 8px; }\n" +
"  button:disabled { opacity: 0.5; cursor: default; }\n" +
"  .row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }\n" +
"  .row input { flex: 1; }\n" +
"  .field { margin-top: 8px; }\n" +
"  .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }\n" +
"  .banner { padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }\n" +
"  .banner.ok { background: rgba(22,163,74,0.15); color: var(--ok); }\n" +
"  .banner.error { background: rgba(220,38,38,0.15); color: var(--danger); }\n" +
"  .muted { color: var(--muted); font-size: 13px; }\n" +
"  pre { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 12px;\n" +
"    overflow-x: auto; position: relative; white-space: pre-wrap; word-break: break-all; }\n" +
"  details summary { cursor: pointer; font-size: 14px; font-weight: 500; margin-bottom: 8px; }\n" +
"</style>\n" +
"</head>\n" +
"<body>\n" +
'<div class="wrap">\n' +
"  <h1>Account Vault</h1>\n" +
'  <p class="sub">Every account this MCP server can switch between, live, with no logout/login needed.</p>\n' +
'  <div id="banner"></div>\n' +
'  <div id="update-area" class="card"></div>\n' +
'  <div id="services"></div>\n' +
'  <div class="card">\n' +
"    <h2>Connect this to an AI app</h2>\n" +
'    <p class="desc">Same server, every client - pick yours:</p>\n' +
'    <div id="config-snippets"></div>\n' +
"  </div>\n" +
"</div>\n" +
"<script>\n" +
"(function () {\n" +
"  var copyTexts = {};\n" +
"  var copyCounter = 0;\n" +
"\n" +
"  function escapeHtml(s) {\n" +
"    return s.replace(/[&<>]/g, function (c) {\n" +
"      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';\n" +
"    });\n" +
"  }\n" +
"\n" +
"  function pre(text) {\n" +
"    var id = 'copy' + (copyCounter++);\n" +
"    copyTexts[id] = text;\n" +
"    return '<pre>' + escapeHtml(text) + '<button class=\"copy-btn\" data-copy-id=\"' + id + '\">Copy</button></pre>';\n" +
"  }\n" +
"\n" +
"  function wireCopyButtons(root) {\n" +
"    var buttons = root.querySelectorAll('[data-copy-id]');\n" +
"    for (var i = 0; i < buttons.length; i++) {\n" +
"      (function (btn) {\n" +
"        btn.onclick = function () {\n" +
"          var text = copyTexts[btn.getAttribute('data-copy-id')];\n" +
"          navigator.clipboard.writeText(text).then(function () {\n" +
"            btn.textContent = 'Copied';\n" +
"            setTimeout(function () { btn.textContent = 'Copy'; }, 1200);\n" +
"          });\n" +
"        };\n" +
"      })(buttons[i]);\n" +
"    }\n" +
"  }\n" +
"\n" +
"  function renderConfigSnippets(projectRoot) {\n" +
"    var entry = projectRoot + '/dist/index.js';\n" +
"    var json = JSON.stringify({ mcpServers: { 'account-vault': { command: 'node', args: [entry] } } }, null, 2);\n" +
"    var codeCmd = 'claude mcp add --transport stdio --scope user account-vault -- node ' + entry;\n" +
"    var el = document.getElementById('config-snippets');\n" +
"    el.innerHTML =\n" +
"      '<details open><summary>Claude Desktop</summary><p class=\"desc\">Settings -> Developer -> Edit Config:</p>' + pre(json) + '</details>' +\n" +
"      '<details><summary>Cursor</summary><p class=\"desc\">~/.cursor/mcp.json (create if missing):</p>' + pre(json) + '</details>' +\n" +
"      '<details><summary>Claude Code</summary>' + pre(codeCmd) + '</details>';\n" +
"    wireCopyButtons(el);\n" +
"  }\n" +
"\n" +
"  function renderServices(state) {\n" +
"    var root = document.getElementById('services');\n" +
"    root.innerHTML = '';\n" +
"    for (var i = 0; i < state.services.length; i++) {\n" +
"      var svc = state.services[i];\n" +
"      var accounts = state.accounts.filter(function (a) { return a.service === svc.service; });\n" +
"      var html = '<h2>' + svc.displayName + '</h2>';\n" +
"\n" +
"      if (accounts.length === 0) {\n" +
"        html += '<p class=\"desc\">No accounts yet.</p>';\n" +
"      } else {\n" +
"        html += accounts.map(function (a) {\n" +
"          return '<div class=\"account-row\"><div class=\"who\"><div class=\"label\">' + a.label +\n" +
"            '</div><div class=\"email\">' + a.displayName + '</div></div>' +\n" +
"            '<button class=\"danger\" data-remove=\"' + svc.service + '|' + a.label + '\">Remove</button></div>';\n" +
"        }).join('');\n" +
"      }\n" +
"\n" +
"      if (svc.authKind === 'oauth2' && !svc.configured) {\n" +
"        html += '<details style=\"margin-top:14px\"><summary>Set up ' + svc.displayName + ' (one-time)</summary>' +\n" +
"          '<p class=\"desc\">Paste the OAuth Client ID / Client Secret from Google Cloud Console (see README.md).</p>' +\n" +
"          '<div class=\"field\"><label>Client ID</label><input data-cfg-id=\"' + svc.service + '\" /></div>' +\n" +
"          '<div class=\"field\"><label>Client Secret</label><input type=\"password\" data-cfg-secret=\"' + svc.service + '\" /></div>' +\n" +
"          '<div class=\"row\"><button data-save-config=\"' + svc.service + '\">Save</button></div></details>';\n" +
"      } else if (svc.authKind === 'oauth2' && svc.configured) {\n" +
"        html += '<div class=\"row\" style=\"margin-top:14px\">' +\n" +
"          '<input placeholder=\"label, e.g. work\" data-oauth-label=\"' + svc.service + '\" />' +\n" +
"          '<button data-oauth-start=\"' + svc.service + '\">Connect ' + svc.displayName + '</button></div>';\n" +
"      } else if (svc.authKind === 'apikey') {\n" +
"        var fieldsHtml = svc.fields.map(function (f) {\n" +
"          return '<div class=\"field\"><label>' + f.label + '</label><input type=\"' + (f.secret ? 'password' : 'text') +\n" +
"            '\" data-apikey-field=\"' + svc.service + '|' + f.name + '\" /></div>';\n" +
"        }).join('');\n" +
"        html += '<div style=\"margin-top:14px\">' +\n" +
"          '<div class=\"field\"><label>Label</label><input placeholder=\"e.g. prod\" data-apikey-label=\"' + svc.service + '\" /></div>' +\n" +
"          fieldsHtml +\n" +
"          '<div class=\"row\"><button data-apikey-submit=\"' + svc.service + '\">Add account</button></div></div>';\n" +
"      }\n" +
"\n" +
"      var card = document.createElement('div');\n" +
"      card.className = 'card';\n" +
"      card.innerHTML = html;\n" +
"      root.appendChild(card);\n" +
"    }\n" +
"    wireServiceEvents(state);\n" +
"  }\n" +
"\n" +
"  function wireServiceEvents(state) {\n" +
"    var removeButtons = document.querySelectorAll('[data-remove]');\n" +
"    for (var i = 0; i < removeButtons.length; i++) {\n" +
"      (function (btn) {\n" +
"        btn.onclick = function () {\n" +
"          var parts = btn.getAttribute('data-remove').split('|');\n" +
"          var service = parts[0], label = parts[1];\n" +
"          if (!confirm('Remove ' + label + ' (' + service + ')? This deletes it from the Keychain too.')) return;\n" +
"          fetch('/api/remove-account', {\n" +
"            method: 'POST', headers: { 'Content-Type': 'application/json' },\n" +
"            body: JSON.stringify({ service: service, label: label })\n" +
"          }).then(function () { location.reload(); });\n" +
"        };\n" +
"      })(removeButtons[i]);\n" +
"    }\n" +
"\n" +
"    var saveConfigButtons = document.querySelectorAll('[data-save-config]');\n" +
"    for (var j = 0; j < saveConfigButtons.length; j++) {\n" +
"      (function (btn) {\n" +
"        btn.onclick = function () {\n" +
"          var service = btn.getAttribute('data-save-config');\n" +
"          var clientId = document.querySelector('[data-cfg-id=\"' + service + '\"]').value.trim();\n" +
"          var clientSecret = document.querySelector('[data-cfg-secret=\"' + service + '\"]').value.trim();\n" +
"          if (!clientId || !clientSecret) { alert('Both fields are required.'); return; }\n" +
"          btn.disabled = true; btn.textContent = 'Saving...';\n" +
"          fetch('/api/oauth-config', {\n" +
"            method: 'POST', headers: { 'Content-Type': 'application/json' },\n" +
"            body: JSON.stringify({ service: service, clientId: clientId, clientSecret: clientSecret })\n" +
"          }).then(function (res) {\n" +
"            if (res.ok) { location.reload(); }\n" +
"            else { btn.disabled = false; btn.textContent = 'Save'; alert('Could not save.'); }\n" +
"          });\n" +
"        };\n" +
"      })(saveConfigButtons[j]);\n" +
"    }\n" +
"\n" +
"    var oauthStartButtons = document.querySelectorAll('[data-oauth-start]');\n" +
"    for (var k = 0; k < oauthStartButtons.length; k++) {\n" +
"      (function (btn) {\n" +
"        btn.onclick = function () {\n" +
"          var service = btn.getAttribute('data-oauth-start');\n" +
"          var input = document.querySelector('[data-oauth-label=\"' + service + '\"]');\n" +
"          var label = input.value.trim();\n" +
"          if (!label) { alert('Give this account a label first, e.g. \"work\".'); return; }\n" +
"          location.href = '/oauth/start?service=' + encodeURIComponent(service) + '&label=' + encodeURIComponent(label);\n" +
"        };\n" +
"      })(oauthStartButtons[k]);\n" +
"    }\n" +
"\n" +
"    var apikeyButtons = document.querySelectorAll('[data-apikey-submit]');\n" +
"    for (var m = 0; m < apikeyButtons.length; m++) {\n" +
"      (function (btn) {\n" +
"        btn.onclick = function () {\n" +
"          var service = btn.getAttribute('data-apikey-submit');\n" +
"          var labelInput = document.querySelector('[data-apikey-label=\"' + service + '\"]');\n" +
"          var label = labelInput.value.trim();\n" +
"          if (!label) { alert('Give this account a label first.'); return; }\n" +
"          var svc = state.services.filter(function (s) { return s.service === service; })[0];\n" +
"          var values = {};\n" +
"          for (var n = 0; n < svc.fields.length; n++) {\n" +
"            var f = svc.fields[n];\n" +
"            var fieldInput = document.querySelector('[data-apikey-field=\"' + service + '|' + f.name + '\"]');\n" +
"            values[f.name] = fieldInput.value.trim();\n" +
"          }\n" +
"          btn.disabled = true; btn.textContent = 'Verifying...';\n" +
"          fetch('/api/apikey-account', {\n" +
"            method: 'POST', headers: { 'Content-Type': 'application/json' },\n" +
"            body: JSON.stringify({ service: service, label: label, values: values })\n" +
"          }).then(function (res) { return res.json(); }).then(function (data) {\n" +
"            if (data.ok) { location.href = '/?added=' + encodeURIComponent(label); }\n" +
"            else { btn.disabled = false; btn.textContent = 'Add account'; alert(data.error || 'Could not verify credentials.'); }\n" +
"          });\n" +
"        };\n" +
"      })(apikeyButtons[m]);\n" +
"    }\n" +
"  }\n" +
"\n" +
"  function loadUpdateStatus() {\n" +
"    var el = document.getElementById('update-area');\n" +
"    el.innerHTML = '<h2>Version</h2><p class=\"muted\">Checking for updates...</p>';\n" +
"    fetch('/api/update-status').then(function (r) { return r.json(); }).then(function (status) {\n" +
"      if (status.checkFailed) {\n" +
"        el.innerHTML = '<h2>Version</h2><p class=\"muted\">Could not check for updates (offline?).</p>';\n" +
"      } else if (status.upToDate) {\n" +
"        el.innerHTML = '<h2>Version</h2><p class=\"muted\">Up to date.</p>';\n" +
"      } else {\n" +
"        var behind = status.behindBy ? ' (' + status.behindBy + ' commits behind)' : '';\n" +
"        el.innerHTML = '<h2>Version</h2><p class=\"muted\">Update available' + behind + '.</p><button id=\"update-btn\">Update now</button>';\n" +
"        document.getElementById('update-btn').onclick = function (ev) {\n" +
"          ev.target.disabled = true; ev.target.textContent = 'Updating (this can take a minute)...';\n" +
"          fetch('/api/update', { method: 'POST' }).then(function (r) { return r.json(); }).then(function (res) {\n" +
"            el.innerHTML = res.ok\n" +
"              ? '<h2>Version</h2><p class=\"muted\">Updated. Fully quit and reopen your AI app to pick up the changes.</p>'\n" +
"              : '<h2>Version</h2><p class=\"banner error\">' + (res.error || 'Update failed.') + '</p>';\n" +
"          });\n" +
"        };\n" +
"      }\n" +
"    }).catch(function () {\n" +
"      el.innerHTML = '<h2>Version</h2><p class=\"muted\">Could not check for updates.</p>';\n" +
"    });\n" +
"  }\n" +
"\n" +
"  var bannerEl = document.getElementById('banner');\n" +
"  var params = new URLSearchParams(location.search);\n" +
"  if (params.get('added')) {\n" +
"    bannerEl.innerHTML = '<div class=\"banner ok\">Added \"' + params.get('added') + '\" successfully.</div>';\n" +
"    history.replaceState({}, '', location.pathname);\n" +
"  } else if (params.get('error')) {\n" +
"    bannerEl.innerHTML = '<div class=\"banner error\">' + params.get('error') + '</div>';\n" +
"    history.replaceState({}, '', location.pathname);\n" +
"  }\n" +
"\n" +
"  var state = null;\n" +
"  fetch('/api/state').then(function (r) { return r.json(); }).then(function (s) {\n" +
"    state = s;\n" +
"    renderServices(state);\n" +
"    renderConfigSnippets(state.projectRoot);\n" +
"    loadUpdateStatus();\n" +
"  });\n" +
"})();\n" +
"</script>\n" +
"</body>\n" +
"</html>\n";
