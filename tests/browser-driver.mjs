// Local Chrome DevTools driver: no installed automation dependency needed.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function openBrowser() {
  const binary = process.env.CHROME_BIN ?? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  if (!binary) throw new Error("Chrome/Edge bulunamadı; CHROME_BIN ayarla.");
  const profile = resolve("test-artifacts", `browser-${process.pid}-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const child = spawn(binary, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-background-networking", "--disable-extensions",
    ...(process.env.BROWSER_TEST_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
    `--user-data-dir=${profile}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let ws;
  try {
    const portFile = resolve(profile, "DevToolsActivePort");
    const until = Date.now() + 20000;
    while (!existsSync(portFile)) {
      if (Date.now() > until || child.exitCode !== null) throw new Error("Tarayıcı başlatılamadı.");
      await delay(100);
    }
    const port = readFileSync(portFile, "utf8").split("\n")[0].trim();
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await new Promise((ok, fail) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", fail, { once: true }); });
    let id = 0;
    const errors = [];
    const calls = new Map();
    ws.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push(message.params.entry.text);
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map(x => x.value ?? x.description).join(' '));
      const entry = calls.get(message.id);
      if (!entry) return;
      calls.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.fail(new Error(JSON.stringify(message.error)));
      else entry.ok(message.result);
    });
    const send = (method, params = {}) => new Promise((ok, fail) => {
      const request = ++id;
      const timer = setTimeout(() => { calls.delete(request); fail(new Error(`CDP timeout: ${method}`)); }, 20000);
      calls.set(request, { ok, fail, timer });
      ws.send(JSON.stringify({ id: request, method, params }));
    });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      const end = Date.now() + 25000;
      while (Date.now() < end) {
        if (await evaluate(`Boolean(${expression})`)) return;
        await delay(100);
      }
      const diagnostics = await evaluate("JSON.stringify({url:location.href,hidden:document.hidden,text:document.body.innerText.slice(0,600),resources:performance.getEntriesByType('resource').slice(-8).map(x=>({name:x.name,status:x.responseStatus}))})");
      throw new Error(`Tarayıcı beklentisi gerçekleşmedi: ${expression}\n${diagnostics}\n${errors.join('\n')}`);
    };
    await send("Network.enable"); await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
    await send("Page.bringToFront");
    const session = await (await fetch("http://127.0.0.1:54330/fixture/session")).json();
    await send("Network.setCookie", { name: session.name, value: session.value, url: "http://127.0.0.1:3100", sameSite: "Lax" });
    return { send, evaluate, waitFor, errors, close: async () => {
      try { await send("Browser.close"); } catch { /* Chrome may close before acknowledging. */ }
      ws.close(); child.kill();
    } };
  } catch (error) { ws?.close(); child.kill(); throw error; }
}
