import { app } from "electron";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getCaptureWindow, hideCaptureWindow, showCaptureWindow } from "./capture-window.js";
import { LATENCY_BUDGET_MS, stats } from "./latency.js";
import { loadSettings } from "./settings.js";
import { INBOX } from "./vault.js";

/**
 * Meet het acceptatiecriterium van fase 1: hotkey → knipperende cursor onder 80 ms.
 *
 *   EMQNOTE_SELFTEST=50 EMQNOTE_VAULT=/pad/naar/tijdelijk npm start
 *
 * De meting begint waar de sneltoets binnenkomt, in `showCaptureWindow`, en eindigt
 * wanneer de renderer meldt dat er ná het zetten van de cursor een frame is getekend.
 * Wat hier níét in zit is het OS dat de sneltoets aflevert; dat is een handeling van
 * de vensterbeheerder die we niet kunnen instrumenteren. Alles wat wij zelf doen zit
 * er wel in.
 */

let resolvePaint: (() => void) | null = null;

/** Aangeroepen door de IPC-handler zodra de renderer een frame heeft getekend. */
export function notifyPainted(): void {
  const resolve = resolvePaint;
  resolvePaint = null;
  resolve?.();
}

function waitForPaint(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolvePaint = null;
      resolve(false);
    }, timeoutMs);

    resolvePaint = () => {
      clearTimeout(timer);
      resolve(true);
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSelfTest(rounds: number): Promise<void> {
  const window = getCaptureWindow();
  if (window === null) {
    console.error("[zelftest] geen capture-venster");
    app.exit(1);
    return;
  }

  if (window.webContents.isLoading()) {
    await new Promise<void>((resolve) =>
      window.webContents.once("did-finish-load", () => resolve()),
    );
  }

  // Even laten bezinken: de eerste vertoning van een venster kost het OS altijd wat
  // extra, en dat zegt niets over het dagelijks gebruik van een residente app.
  await sleep(1000);
  showCaptureWindow();
  await waitForPaint(5000);
  hideCaptureWindow();
  await sleep(200);

  let missed = 0;
  for (let round = 0; round < rounds; round += 1) {
    showCaptureWindow();
    if (!(await waitForPaint(5000))) missed += 1;
    hideCaptureWindow();
    await sleep(120);
  }

  const saved = await captureRealNote();

  const result = stats();
  console.log(
    JSON.stringify(
      {
        budgetMs: LATENCY_BUDGET_MS,
        rondes: rounds,
        gemist: missed,
        p50: Number(result.p50.toFixed(1)),
        p95: Number(result.p95.toFixed(1)),
        max: Number(result.max.toFixed(1)),
        binnenBudget: result.withinBudget,
        bewaardAls: saved,
      },
      null,
      2,
    ),
  );

  app.exit(result.withinBudget && missed === 0 && saved !== null ? 0 : 1);
}

const PROEFTEKST = [
  "Zelftest fase 1",
  "",
  "Eerste regel van de toelichting.",
  "Tweede regel, zachte overgang.",
  "",
  "Een tweede alinea.",
].join("\n");

/**
 * Typt daadwerkelijk in de textarea en sluit het venster, zodat de hele keten wordt
 * afgelegd: toetsaanslag → React → IPC → serializer uit fase 0 → atomair bestand.
 * Alleen zo weet je dat het opslaan werkt en niet alleen dat de functies bestaan.
 */
async function captureRealNote(): Promise<string | null> {
  const window = getCaptureWindow();
  const vault = loadSettings().vaultPath;
  if (window === null || vault === null) return null;

  showCaptureWindow();
  await waitForPaint(5000);

  await window.webContents.executeJavaScript(`
    (() => {
      const field = document.querySelector('textarea');
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value',
      ).set;
      setValue.call(field, ${JSON.stringify(PROEFTEKST)});
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return field.value.length;
    })()
  `);

  hideCaptureWindow();
  await sleep(800);

  const inbox = join(vault, INBOX);
  const written = existsSync(inbox)
    ? readdirSync(inbox).filter((name) => name.endsWith(".md"))
    : [];

  if (written.length !== 1) {
    console.error(`[zelftest] verwachtte één notitie in de Inbox, vond er ${written.length}`);
    return null;
  }

  console.log("--- geschreven notitie ---");
  console.log(readFileSync(join(inbox, written[0]!), "utf8"));

  return written[0]!;
}
