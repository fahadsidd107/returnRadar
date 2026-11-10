"use strict";
let token = null;
const $ = (id) => document.getElementById(id);
function status(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
}
function render() {
  $("signed-out").hidden = !!token;
  $("signed-in").hidden = !token;
}
async function request(query, variables = {}) {
  const endpoint = $("api-url").value;
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw Error("Use HTTPS for a remote API endpoint.");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw Error(`API request failed (${response.status}).`);
  const result = await response.json();
  if (result.errors?.length)
    throw Error(result.errors.map((e) => e.message).join("; "));
  return result.data;
}
async function run(button, task) {
  button.disabled = true;
  status("Working…");
  try {
    await task();
  } catch (e) {
    status(e.message || "Unable to complete this action. Try again.", true);
  } finally {
    button.disabled = false;
  }
}
$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  run($("login"), async () => {
    const data = await request(
      "mutation SignIn($email:String!,$password:String!){signIn(email:$email,password:$password){token expiresAt}}",
      { email: $("email").value, password: $("password").value },
    );
    token = data.signIn.token;
    $("password").value = "";
    render();
    status(
      "Signed in. Session expires at " +
        new Date(data.signIn.expiresAt).toLocaleTimeString() +
        ".",
    );
  });
});
$("export").addEventListener("click", () =>
  run($("export"), async () => {
    const data = await request("query { exportData }");
    const blob = new Blob([data.exportData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "return-radar-export.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Your account export is ready to download. Keep it private.");
  }),
);
$("logout").addEventListener("click", () =>
  run($("logout"), async () => {
    await request("mutation { logout }");
    token = null;
    render();
    status("Signed out. This session has been revoked.");
  }),
);
$("delete-check").addEventListener(
  "change",
  () => ($("delete").disabled = !$("delete-check").checked),
);
$("delete").addEventListener("click", () =>
  run($("delete"), async () => {
    if (!$("delete-check").checked) return;
    await request("mutation { deleteAccount }");
    token = null;
    $("delete-check").checked = false;
    render();
    status(
      "Account and active server records deleted. Backup retention is controlled by your server operator.",
    );
  }),
);
render();
