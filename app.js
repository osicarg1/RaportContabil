const form = document.getElementById("input-form");
const reportOutput = document.getElementById("reportOutput");
const copyBtn = document.getElementById("copyBtn");
const mailtoLink = document.getElementById("mailtoLink");
const chartsSection = document.getElementById("chartsSection");
const yearlyChartCanvas = document.getElementById("yearlyChart");
const monthlyChartCanvas = document.getElementById("monthlyChart");
const reportPreview = document.getElementById("reportPreview");
const companyNameInput = document.getElementById("companyName");
const adminNameInput = document.getElementById("adminName");
const adminEmailInput = document.getElementById("adminEmail");
const reportPeriodInput = document.getElementById("reportPeriod");
const balanceFileInput = document.getElementById("balanceFile");

let yearlyChartInstance = null;
let monthlyChartInstance = null;
let extractionCache = {
  key: "",
  rows: null
};

if (chartsSection) {
  chartsSection.hidden = true;
}

const indicatorDefinitions = {
  activeImobilizate: {
    rowIds: ["25", "04"],
    labels: ["active imobilizate - total", "active imobilizate total"],
    sheetHints: ["bilant"]
  },
  activeCirculante: {
    rowIds: ["41", "09"],
    labels: ["active circulante - total", "active circulante total"],
    sheetHints: ["bilant"]
  },
  cheltuieliInAvans: {
    rowIds: ["42", "10"],
    labels: ["cheltuieli in avans"],
    sheetHints: ["bilant"]
  },
  datoriiCurente: {
    rowIds: ["53", "13"],
    labels: ["datorii", "pana la un an"],
    sheetHints: ["bilant"]
  },
  datoriiTermenLung: {
    rowIds: ["64", "16"],
    labels: ["datorii", "mai mare de un an"],
    sheetHints: ["bilant"]
  },
  capitaluriProprii: {
    rowIds: ["100", "46"],
    labels: ["capitaluri proprii - total", "capitaluri proprii total"],
    sheetHints: ["bilant"]
  },
  cifraAfaceri: {
    rowIds: ["01"],
    labels: ["cifra de afaceri neta"],
    sheetHints: ["profit", "pierdere"]
  },
  profitNet: {
    rowIds: ["68", "08"],
    labels: ["profitul sau pierderea net", "profit (rd. 64 - 66 - 67)"],
    sheetHints: ["profit", "pierdere"]
  },
  pierdereNeta: {
    rowIds: ["69", "09"],
    labels: ["pierdere", "neta"],
    sheetHints: ["profit", "pierdere"]
  }
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearCharts();
  if (chartsSection) {
    chartsSection.hidden = true;
  }

  const companyName = companyNameInput.value.trim();
  const adminName = adminNameInput.value.trim();
  const adminEmail = adminEmailInput.value.trim();
  const reportPeriod = reportPeriodInput.value.trim();
  const fileInput = balanceFileInput;

  if (!fileInput.files || !fileInput.files[0]) {
    alert("Selecteaza un fisier de balanta pe conturi.");
    return;
  }

  try {
    const file = fileInput.files[0];
    const rows = await extractRowsWithCache(file);
    const metrics = computeMetrics(rows);
    const report = buildReport({ companyName, adminName, reportPeriod, metrics });

    reportOutput.value = report;
    renderReportPreview(report, metrics);
    copyBtn.disabled = false;
    updateMailto(adminEmail, companyName, reportPeriod, report);
    renderEvolutionCharts(metrics);
  } catch (error) {
    console.error(error);
    alert("Nu am putut procesa fisierul. Verifica formatul si incearca din nou.");
    clearCharts();
  }
});

balanceFileInput.addEventListener("change", async () => {
  if (!balanceFileInput.files || !balanceFileInput.files[0]) {
    return;
  }

  try {
    const file = balanceFileInput.files[0];
    const rows = await extractRowsWithCache(file);
    const defaults = inferFormDefaults(rows, file.name);
    applyDetectedDefaults(defaults);
  } catch (error) {
    console.warn("Autofill metadata failed:", error);
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(reportOutput.value);
    copyBtn.textContent = "Copiat";
    setTimeout(() => {
      copyBtn.textContent = "Copiaza text";
    }, 1200);
  } catch (error) {
    alert("Nu am putut copia automat. Selecteaza manual textul.");
  }
});

function updateMailto(email, companyName, reportPeriod, report) {
  const subject = `Raport balanta pe conturi ${companyName} - ${reportPeriod}`;
  const href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`;

  mailtoLink.href = href;
  mailtoLink.classList.remove("disabled");
  mailtoLink.setAttribute("aria-disabled", "false");
}

function renderReportPreview(report, metrics) {
  if (!reportPreview) {
    return;
  }

  const lines = String(report || "").split("\n");
  if (!lines.length || !lines.some((line) => line.trim())) {
    reportPreview.innerHTML = "";
    reportPreview.classList.add("is-empty");
    return;
  }

  const html = [];
  let inAlertsSection = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      html.push('<p class="report-line">&nbsp;</p>');
      return;
    }

    if (/^\d+\)\s+alerte\s+automate/i.test(trimmed)) {
      inAlertsSection = true;
    } else if (/^\d+\)\s+/i.test(trimmed) && !/^\d+\)\s+alerte\s+automate/i.test(trimmed)) {
      inAlertsSection = false;
    }

    const important = isImportantReportLine(trimmed, metrics, inAlertsSection);
    const sectionClass = /^\d+\)\s+/i.test(trimmed) ? " section" : "";
    const importantClass = important ? " important" : "";
    html.push(`<p class="report-line${sectionClass}${importantClass}">${escapeHtml(trimmed)}</p>`);
  });

  reportPreview.innerHTML = html.join("");
  reportPreview.classList.remove("is-empty");
}

function isImportantReportLine(line, metrics, inAlertsSection) {
  const text = String(line || "");

  if (inAlertsSection && text.startsWith("- ")) {
    return true;
  }

  if (/\(pierdere\)/i.test(text)) {
    return true;
  }

  if (/[:\s]-\d/.test(text)) {
    return true;
  }

  if (/lichiditate imediata/i.test(text) && metrics && metrics.lichiditateImediata !== null && metrics.lichiditateImediata < 1) {
    return true;
  }

  if (/grad de indatorare/i.test(text) && metrics && metrics.gradIndatorare !== null && metrics.gradIndatorare > 3) {
    return true;
  }

  if (/amenzi|penalitati/i.test(text) && !/:\s*0\s*RON/i.test(text)) {
    return true;
  }

  if (/impozit pe dividende|dividende de plata|decontari cu asociatii/i.test(text) && !/:\s*0\s*RON/i.test(text)) {
    return true;
  }

  return false;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFileCacheKey(file) {
  return [file.name, file.size, file.lastModified].join("::");
}

async function extractRowsWithCache(file) {
  const key = getFileCacheKey(file);
  if (extractionCache.key === key && extractionCache.rows) {
    return extractionCache.rows;
  }

  const rows = await extractRows(file);
  extractionCache = { key, rows };
  return rows;
}

function applyDetectedDefaults(defaults) {
  if (!defaults) {
    return;
  }

  if (defaults.companyName && !companyNameInput.value.trim()) {
    companyNameInput.value = defaults.companyName;
  }

  if (defaults.adminName && !adminNameInput.value.trim()) {
    adminNameInput.value = defaults.adminName;
  } else if (!adminNameInput.value.trim()) {
    adminNameInput.value = "Administrator";
  }

  if (defaults.adminEmail && !adminEmailInput.value.trim()) {
    adminEmailInput.value = defaults.adminEmail;
  }

  if (defaults.reportPeriod && !reportPeriodInput.value.trim()) {
    reportPeriodInput.value = defaults.reportPeriod;
  }
}

function inferFormDefaults(rows, fileName) {
  const metadata = detectPdfBalanceStructure(rows)
    ? extractPdfBalanceMetadata(rows)
    : { company: "", period: "" };

  const textLines = rows
    .map((row) => (row.cells || []).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 400);
  const joinedText = textLines.join("\n");

  const companyFromPdf = sanitizeCompanyName(metadata.company || "");
  const companyFromRows = detectCompanyName(textLines);
  const periodFromPdf = sanitizePeriod(metadata.period || "");
  const periodFromRows = detectPeriodValue(joinedText, rows, fileName);
  const adminName = detectAdminName(joinedText);
  const adminEmail = detectEmail(joinedText);

  return {
    companyName: companyFromPdf || companyFromRows || "",
    adminName,
    adminEmail,
    reportPeriod: periodFromPdf || periodFromRows || ""
  };
}

function sanitizeCompanyName(value) {
  const text = String(value || "").replace(/x{3,}/gi, "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  const companyMatch = text.match(/(?:SC\s+)?[A-Z0-9&\-. ]{2,}\s(?:SRL|S\.R\.L\.|SA|S\.A\.|PFA)$/i);
  if (companyMatch) {
    return companyMatch[0].replace(/\s+/g, " ").trim();
  }

  return text.length <= 80 ? text : "";
}

function detectCompanyName(lines) {
  for (const rawLine of lines) {
    const line = rawLine.replace(/x{3,}/gi, "").replace(/\s+/g, " ").trim();
    if (!line) {
      continue;
    }

    const match = line.match(/(?:SC\s+)?[A-Z0-9&\-. ]{2,}\s(?:SRL|S\.R\.L\.|SA|S\.A\.|PFA)\b/i);
    if (match) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }

  return "";
}

function sanitizePeriod(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function detectPeriodValue(fullText, rows, fileName) {
  const monthMatch = fullText.match(/\b(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)\s+\d{4}\b/i);
  if (monthMatch) {
    const text = monthMatch[0];
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const intervalMatch = fullText.match(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*[-–]\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/);
  if (intervalMatch) {
    return intervalMatch[0];
  }

  const yearFromSheet = [...new Set(rows
    .map((row) => String(row.sheetName || "").trim())
    .filter((name) => /^\d{4}$/.test(name)))]
    .sort()
    .pop();
  if (yearFromSheet) {
    return yearFromSheet;
  }

  const yearFromFile = String(fileName || "").match(/\b(20\d{2})\b/);
  return yearFromFile ? yearFromFile[1] : "";
}

function detectAdminName(fullText) {
  const patterns = [
    /administrator(?:\s+legal)?\s*[:\-]\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț'\-]+(?:\s+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț'\-]+){1,3})/i,
    /reprezentant\s+legal\s*[:\-]\s*([A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț'\-]+(?:\s+[A-ZĂÂÎȘȚ][A-Za-zĂÂÎȘȚăâîșț'\-]+){1,3})/i
  ];

  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function detectEmail(fullText) {
  const match = fullText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

async function extractRows(file) {
  if (/\.pdf$/i.test(file.name)) {
    return extractRowsFromPdf(file);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const rows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

    raw.forEach((line) => {
      const cells = line.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim()));
      rows.push({
        sheetName,
        cells,
        normalizedSheetName: normalizeText(sheetName)
      });
    });
  });

  return rows;
}

async function extractRowsFromPdf(file) {
  if (!window.pdfjsLib) {
    throw new Error("Biblioteca PDF nu este disponibila in pagina.");
  }

  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const buffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const rows = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const grouped = groupPdfItemsByLine(content.items || []);
    const sheetName = `PDF-${pageNum}`;

    grouped.forEach((line) => {
      const text = line.join(" ").replace(/\s+/g, " ").trim();
      if (!text) {
        return;
      }

      const parsedCells = parsePdfBalanceLine(text);
      rows.push({
        sheetName,
        cells: parsedCells,
        normalizedSheetName: normalizeText(sheetName)
      });
    });
  }

  return rows;
}

function groupPdfItemsByLine(items) {
  const lineMap = new Map();

  items.forEach((item) => {
    const y = Math.round((item.transform && item.transform[5]) || 0);
    const x = (item.transform && item.transform[4]) || 0;
    if (!lineMap.has(y)) {
      lineMap.set(y, []);
    }

    lineMap.get(y).push({ x, str: String(item.str || "").trim() });
  });

  return [...lineMap.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, itemsOnLine]) => itemsOnLine
      .sort((a, b) => a.x - b.x)
      .map((item) => item.str)
      .filter(Boolean));
}

function parsePdfBalanceLine(text) {
  const classMatch = text.match(/^Clasa\s+([1-7])\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2})){7}\s*$/i);
  if (classMatch) {
    const numbers = text.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+/g) || [];
    const trailingNums = numbers.slice(-8);
    return [`CLASA${classMatch[1]}`, `Clasa ${classMatch[1]} ${classMatch[2].trim()}`, ...trailingNums];
  }

  const headerLike = /simbol\s*cont/i.test(text) && /sold\s*initial/i.test(text);
  if (headerLike) {
    return [
      "Simbol cont",
      "Denumire",
      "Sold initial debitor",
      "Sold initial creditor",
      "Rulaj lunar debitor",
      "Rulaj lunar creditor",
      "Total sume debitoare",
      "Total sume creditoare",
      "Sold final debitor",
      "Sold final creditor"
    ];
  }

  const accountMatch = text.match(/^(\d{3,4}(?:\s*\.\s*\d{1,2})?)\s+/);
  if (!accountMatch) {
    return [text];
  }

  const symbol = normalizeAccountSymbol(accountMatch[1]);
  const numbers = text.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+/g) || [];
  if (numbers.length < 8) {
    return [text];
  }

  const trailingNums = numbers.slice(-8);
  const namePart = text
    .slice(accountMatch[0].length)
    .replace(new RegExp(`${trailingNums.map((n) => escapeRegExp(n)).join("\\s*")}$`), "")
    .trim();

  return [symbol, namePart, ...trailingNums];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeMetrics(rows) {
  const values = {};

  Object.entries(indicatorDefinitions).forEach(([key, indicator]) => {
    const found = findBestIndicatorValue(rows, indicator);
    values[key] = found;
  });

  if (detectPdfBalanceStructure(rows)) {
    return computePdfBalanceMetrics(rows, values);
  }

  const hasOfficialSheets = rows.some((row) => {
    const sheetName = normalizeText(row.sheetName || "");
    return sheetName.includes("bilant") || sheetName.includes("profit") || sheetName.includes("pierdere") || sheetName.includes("pandl") || sheetName.includes("pl");
  });

  if (!hasOfficialSheets) {
    return computeAccountBalanceMetrics(rows, values);
  }

  const matchedStandardIndicators = Object.values(values).filter((value) => value !== null && value !== undefined).length;
  if (matchedStandardIndicators < 4) {
    return computeAccountBalanceMetrics(rows, values);
  }

  const activeImobilizate = values.activeImobilizate ?? 0;
  const activeCirculante = values.activeCirculante ?? 0;
  const cheltuieliInAvans = values.cheltuieliInAvans ?? 0;
  const datoriiCurente = values.datoriiCurente ?? 0;
  const datoriiTermenLung = values.datoriiTermenLung ?? 0;
  const capitaluriProprii = values.capitaluriProprii ?? 0;
  const cifraAfaceri = values.cifraAfaceri ?? 0;

  let profitNet = values.profitNet;
  if (profitNet === null || profitNet === undefined) {
    const pierdere = values.pierdereNeta ?? 0;
    profitNet = pierdere > 0 ? -Math.abs(pierdere) : 0;
  }

  const totalActive = activeImobilizate + activeCirculante + cheltuieliInAvans;
  const totalDatorii = datoriiCurente + datoriiTermenLung;
  const fondRulment = activeCirculante - datoriiCurente;
  const lichiditateCurenta = safeDivide(activeCirculante, datoriiCurente);
  const gradIndatorare = safeDivide(totalDatorii, capitaluriProprii);
  const solvabilitate = safeDivide(capitaluriProprii, totalActive);
  const missingIndicators = Object.entries(values)
    .filter(([, value]) => value === null || value === undefined)
    .map(([key]) => key);

  return {
    totalActive,
    activeImobilizate,
    activeCirculante,
    cheltuieliInAvans,
    datoriiCurente,
    datoriiTermenLung,
    capitaluriProprii,
    cifraAfaceri,
    profitNet,
    totalDatorii,
    fondRulment,
    lichiditateCurenta,
    gradIndatorare,
    solvabilitate,
    foundRows: values,
    missingIndicators,
    mode: "standard"
  };
}

function detectPdfBalanceStructure(rows) {
  return rows.some((row) => {
    const text = normalizeText((row.cells || []).join(" "));
    return text.includes("simbolcont") && text.includes("soldinitial") && text.includes("rulajlunar") && text.includes("soldfinal");
  });
}

function computePdfBalanceMetrics(rows, standardValues) {
  const metadata = extractPdfBalanceMetadata(rows);
  const accountRowsRaw = extractPdfBalanceAccounts(rows);
  const accountRows = toCanonicalRows(accountRowsRaw);

  if (!accountRows.length) {
    return {
      mode: "pdf-balance",
      error: "Structura de balanta PDF/XLS a fost detectata, dar nu s-au extras conturi numerice.",
      metadata,
      foundRows: standardValues,
      missingIndicators: []
    };
  }

  const venituriLunare = sumByClassRulaj(accountRows, "7", "credit");
  const cheltuieliLunare = sumByClassRulaj(accountRows, "6", "debit");
  const rezultatLunar = venituriLunare - cheltuieliLunare;

  const rezultatCumulat121 = netByPrefixFinal(accountRows, ["121"], "credit");
  const rezultatCumulat = rezultatCumulat121 !== 0 ? rezultatCumulat121 : rezultatLunar;

  const activeImobilizateNet = netByPrefixFinal(accountRows, ["2"], "debit");
  const stocuriNet = netByPrefixFinal(accountRows, ["3"], "debit");
  const creanteClientiNet = netByPrefixFinal(accountRows, ["411", "413"], "debit");
  const numerarBanciCasa = netByPrefixFinal(accountRows, ["512", "531", "532"], "debit");
  const avansuriTrezorerie = netByPrefixFinal(accountRows, ["542"], "debit");

  const datoriiFurnizori = netByPrefixFinal(accountRows, ["401", "408", "419"], "credit");
  const datoriiSalariale = netByPrefixFinal(accountRows, ["421"], "credit");
  const datoriiFiscale = netByPrefixFinal(accountRows, ["431", "436", "4423", "444", "446", "447", "448"], "credit");
  const crediteScurte = netByPrefixFinal(accountRows, ["519"], "credit");
  const capitaluriProprii = netByPrefixFinal(accountRows, ["101", "105", "106", "117", "121"], "credit");

  const totalActiveEstimate = Math.max(activeImobilizateNet + stocuriNet + creanteClientiNet + numerarBanciCasa + avansuriTrezorerie, 0);
  const totalDatoriiEstimate = Math.max(datoriiFurnizori + datoriiSalariale + datoriiFiscale + crediteScurte, 0);
  const trezorerieNeta = numerarBanciCasa - crediteScurte;

  const marjaLunara = safeDivide(rezultatLunar, venituriLunare);
  const gradIndatorare = safeDivide(totalDatoriiEstimate, capitaluriProprii);
  const lichiditateImediata = safeDivide(numerarBanciCasa + creanteClientiNet, totalDatoriiEstimate);

  const cheltMarfaLunar = sumByPrefixRulaj(accountRows, ["607"], "debit");
  const cheltPersonalLunar = sumByPrefixRulaj(accountRows, ["641", "642", "643", "644", "645", "646"], "debit");
  const cheltServiciiLunar = sumByPrefixRulaj(accountRows, ["611", "612", "613", "614", "615", "621", "622", "623", "624", "625", "626", "627", "628"], "debit");
  const cheltDobanziLunar = sumByPrefixRulaj(accountRows, ["666"], "debit");
  const cheltTaxeLunar = sumByPrefixRulaj(accountRows, ["635", "691", "698"], "debit");
  const cashOutLunarProxy = cheltMarfaLunar + cheltPersonalLunar + cheltServiciiLunar + cheltDobanziLunar + cheltTaxeLunar;

  const dividendeDePlataSold = netByPrefixFinal(accountRows, ["457"], "credit");
  const platiDividendeLunare = sumByPrefixRulaj(accountRows, ["457"], "debit");
  const decontariAsociatiSold = netByPrefixFinal(accountRows, ["455", "456"], "credit");
  const creanteDividende463 = netByPrefixFinal(accountRows, ["463"], "debit");
  const impozitDividendeSold = netByPrefixFinal(accountRows, ["446.01"], "credit");
  const impozitProfitLunar = sumByPrefixRulaj(accountRows, ["691"], "debit");

  const topClienti = topAccounts(accountRowsRaw, ["4111"], "soldFinalDeb", 8, true);
  const topFurnizori = topAccounts(accountRowsRaw, ["401"], "soldFinalCred", 8, true);
  const requestedElements = buildRequestedElementsPdfAnalysis(accountRows, {
    totalVenituri: venituriLunare,
    totalCheltuieli: cheltuieliLunare,
    rezultat121: rezultatCumulat
  });

  const alerts = [];
  if (marjaLunara !== null && marjaLunara < 0.05) {
    alerts.push("Marja lunara sub 5%: profitabilitate lunara fragila.");
  }
  if (lichiditateImediata !== null && lichiditateImediata < 1) {
    alerts.push("Lichiditate imediata sub 1: presiune potentiala pe plata obligatiilor curente.");
  }
  if (cheltMarfaLunar > 0 && safeDivide(cheltMarfaLunar, cheltuieliLunare) > 0.75) {
    alerts.push("Pondere foarte mare a cheltuielilor cu marfa in total cheltuieli lunare.");
  }
  if (dividendeDePlataSold > 0 || platiDividendeLunare > 0) {
    alerts.push("Exista expunere/miscari pe dividende (cont 457); verificati corelarea cu deciziile AGA.");
  }
  if (impozitDividendeSold > 0) {
    alerts.push("Exista sold la impozit dividende (446.01); verificati scadentele de plata.");
  }

  return {
    mode: "pdf-balance",
    metadata,
    venituriLunare,
    cheltuieliLunare,
    rezultatLunar,
    rezultatCumulat,
    activeImobilizateNet,
    stocuriNet,
    creanteClientiNet,
    numerarBanciCasa,
    avansuriTrezorerie,
    datoriiFurnizori,
    datoriiSalariale,
    datoriiFiscale,
    crediteScurte,
    capitaluriProprii,
    totalActiveEstimate,
    totalDatoriiEstimate,
    trezorerieNeta,
    marjaLunara,
    gradIndatorare,
    lichiditateImediata,
    cheltMarfaLunar,
    cheltPersonalLunar,
    cheltServiciiLunar,
    cheltDobanziLunar,
    cheltTaxeLunar,
    cashOutLunarProxy,
    dividendeDePlataSold,
    platiDividendeLunare,
    decontariAsociatiSold,
    creanteDividende463,
    impozitDividendeSold,
    impozitProfitLunar,
    requestedElements,
    topClienti,
    topFurnizori,
    alerts,
    foundRows: standardValues,
    missingIndicators: []
  };
}

function extractPdfBalanceMetadata(rows) {
  let company = "";
  let period = "";

  rows.forEach((row) => {
    const firstCell = String((row.cells && row.cells[0]) || "").trim();
    const fullText = (row.cells || []).join(" ");

    if (!company && /srl|sa|pfa/i.test(firstCell) && firstCell.length < 80) {
      company = firstCell;
    }

    if (!period && /perioada/i.test(fullText)) {
      period = fullText.replace(/.*perioada\s*:?/i, "").trim();
    }
  });

  return { company, period };
}

function extractPdfBalanceAccounts(rows) {
  const headerIndex = rows.findIndex((row) => {
    const text = normalizeText((row.cells || []).join(" "));
    return text.includes("simbolcont") && text.includes("soldinitial") && text.includes("soldfinal");
  });

  if (headerIndex < 0) {
    return [];
  }

  const result = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const cells = rows[i].cells || [];
    const symbolRaw = String(cells[0] || "").trim();
    const name = String(cells[1] || "").trim();
    const classSymbol = symbolRaw.match(/^CLASA([1-7])$/i);
    const symbol = classSymbol ? `CLASA${classSymbol[1]}` : normalizeAccountSymbol(symbolRaw);

    if (!symbol || (!/^\d{3,4}(\.\d+)?$/.test(symbol) && !/^CLASA[1-7]$/.test(symbol))) {
      continue;
    }

    const soldInitDeb = parseNumber(cells[2]);
    const soldInitCred = parseNumber(cells[3]);
    const rulajDeb = parseNumber(cells[4]);
    const rulajCred = parseNumber(cells[5]);
    const totalDeb = parseNumber(cells[6]);
    const totalCred = parseNumber(cells[7]);
    const soldFinalDeb = parseNumber(cells[8]);
    const soldFinalCred = parseNumber(cells[9]);

    const allInvalid = [soldInitDeb, soldInitCred, rulajDeb, rulajCred, totalDeb, totalCred, soldFinalDeb, soldFinalCred]
      .every((value) => !Number.isFinite(value));
    if (allInvalid) {
      continue;
    }

    result.push({
      symbol,
      name,
      soldInitDeb: Number.isFinite(soldInitDeb) ? soldInitDeb : 0,
      soldInitCred: Number.isFinite(soldInitCred) ? soldInitCred : 0,
      rulajDeb: Number.isFinite(rulajDeb) ? rulajDeb : 0,
      rulajCred: Number.isFinite(rulajCred) ? rulajCred : 0,
      totalDeb: Number.isFinite(totalDeb) ? totalDeb : 0,
      totalCred: Number.isFinite(totalCred) ? totalCred : 0,
      soldFinalDeb: Number.isFinite(soldFinalDeb) ? soldFinalDeb : 0,
      soldFinalCred: Number.isFinite(soldFinalCred) ? soldFinalCred : 0
    });
  }

  return result;
}

function toCanonicalRows(rows) {
  const bySymbol = new Map();

  rows.forEach((row) => {
    const key = row.symbol;
    const score = row.totalDeb + row.totalCred;
    const existing = bySymbol.get(key);

    if (!existing || score > existing.score) {
      bySymbol.set(key, { score, row });
    }
  });

  return [...bySymbol.values()].map((entry) => entry.row);
}

function normalizeAccountSymbol(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/,+/g, ".")
    .replace(/[^0-9.]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
}

function sumByClassRulaj(rows, classPrefix, side) {
  const classRow = rows.find((row) => row.symbol === `CLASA${classPrefix}`);
  if (classRow) {
    return side === "debit" ? classRow.rulajDeb : classRow.rulajCred;
  }

  return rows
    .filter((row) => row.symbol.startsWith(String(classPrefix)) && !row.symbol.startsWith("CLASA"))
    .reduce((sum, row) => sum + (side === "debit" ? row.rulajDeb : row.rulajCred), 0);
}

function sumByPrefixRulaj(rows, prefixes, side) {
  return prefixes.reduce((sum, prefix) => {
    const selected = resolveRowsForPrefix(rows, String(prefix));
    return sum + selected.reduce((acc, row) => acc + (side === "debit" ? row.rulajDeb : row.rulajCred), 0);
  }, 0);
}

function netByPrefixFinal(rows, prefixes, side) {
  const selectedRows = prefixes.flatMap((prefix) => resolveRowsForPrefix(rows, String(prefix)));
  const uniqueRows = uniqueBySymbol(selectedRows);

  const { deb, cred } = uniqueRows
    .reduce((acc, row) => {
      acc.deb += row.soldFinalDeb;
      acc.cred += row.soldFinalCred;
      return acc;
    }, { deb: 0, cred: 0 });

  return side === "debit" ? Math.max(deb - cred, 0) : Math.max(cred - deb, 0);
}

function topAccounts(rows, prefixes, field, limit, excludeGenericNames = false) {
  return rows
    .filter((row) => prefixes.some((prefix) => row.symbol.startsWith(String(prefix))))
    .filter((row) => {
      if (!excludeGenericNames) {
        return true;
      }

      const name = String(row.name || "").trim();
      if (!name || /^[\W_]+$/.test(name)) {
        return false;
      }

      return !/^(furnizori|clienti|casa|conturi?\s+la\s+banci)/i.test(name);
    })
    .map((row) => ({ symbol: row.symbol, name: row.name, value: row[field] || 0 }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function resolveRowsForPrefix(rows, prefix) {
  const exact = rows.filter((row) => row.symbol === prefix);
  if (exact.length) {
    return exact;
  }

  const candidates = rows.filter((row) => row.symbol.startsWith(prefix));
  if (!candidates.length) {
    return [];
  }

  return candidates.filter((row) => {
    return !candidates.some((other) => other.symbol !== row.symbol
      && row.symbol.startsWith(other.symbol)
      && other.symbol.length < row.symbol.length);
  });
}

function uniqueBySymbol(rows) {
  const map = new Map();

  rows.forEach((row) => {
    if (!map.has(row.symbol)) {
      map.set(row.symbol, row);
    }
  });

  return [...map.values()];
}

function computeAccountBalanceMetrics(rows, standardValues) {
  const yearSheets = [...new Set(rows.map((row) => String(row.sheetName || "")).filter((name) => /^\d{4}$/.test(name)))];
  const sortedYears = yearSheets
    .map((year) => Number(year))
    .sort((a, b) => a - b);
  const latestYear = sortedYears[sortedYears.length - 1];

  if (!latestYear) {
    return {
      mode: "account-balance",
      error: "Nu am gasit foi cu ani (ex: 2026) pentru analiza.",
      missingIndicators: ["totalVenituri", "totalCheltuieli", "profitSauPierdere"],
      foundRows: standardValues
    };
  }

  const latestSheetName = String(latestYear);
  const yearRows = rows.filter((row) => String(row.sheetName) === latestSheetName);
  const previousYearName = String(latestYear - 1);
  const previousYearRows = rows.filter((row) => String(row.sheetName) === previousYearName);
  const headerRow = yearRows.find((row) => normalizeText((row.cells || []).join(" ")).includes("simboldenumire"));

  const monthLabels = headerRow && headerRow.cells.length > 2
    ? headerRow.cells.slice(2).map((value, index) => String(value || `Luna ${index + 1}`).trim() || `Luna ${index + 1}`)
    : ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];

  const venituriRow = findRowByLabel(yearRows, ["total venituri"]);
  const cheltuieliRow = findRowByLabel(yearRows, ["total cheltuieli"]);
  const profitRow = findRowBySymbolOrLabel(yearRows, ["121"], ["profit sau pierdere"]);

  const venituriSeries = extractSeriesFromRow(venituriRow, monthLabels);
  const cheltuieliSeries = extractSeriesFromRow(cheltuieliRow, monthLabels);
  const profitSeries = extractSeriesFromRow(profitRow, monthLabels);

  const previousHeaderRow = previousYearRows.find((row) => normalizeText((row.cells || []).join(" ")).includes("simboldenumire"));
  const previousMonthLabels = previousHeaderRow && previousHeaderRow.cells.length > 2
    ? previousHeaderRow.cells.slice(2).map((value, index) => String(value || `Luna ${index + 1}`).trim() || `Luna ${index + 1}`)
    : monthLabels;
  const prevVenituriRow = findRowByLabel(previousYearRows, ["total venituri"]);
  const prevCheltuieliRow = findRowByLabel(previousYearRows, ["total cheltuieli"]);
  const prevProfitRow = findRowBySymbolOrLabel(previousYearRows, ["121"], ["profit sau pierdere"]);
  const prevVenituriSeries = extractSeriesFromRow(prevVenituriRow, previousMonthLabels);
  const prevCheltuieliSeries = extractSeriesFromRow(prevCheltuieliRow, previousMonthLabels);
  const prevProfitSeries = extractSeriesFromRow(prevProfitRow, previousMonthLabels);

  const cifraAfaceriEstimata = sumSeriesBySymbols(yearRows, monthLabels, ["707", "704", "701", "702", "703", "705", "706", "708"]);
  const cheltuieliMarfa = sumSeriesBySymbols(yearRows, monthLabels, ["607"]);
  const cheltuieliPersonal = sumSeriesBySymbols(yearRows, monthLabels, ["641", "642", "643", "644", "645"]);
  const cheltuieliServicii = sumSeriesBySymbols(yearRows, monthLabels, ["611", "612", "613", "614", "615", "621", "622", "623", "624", "625", "626", "627", "628"]);
  const impozitProfit = sumSeriesBySymbols(yearRows, monthLabels, ["691"]);
  const impozitMicro = sumSeriesBySymbols(yearRows, monthLabels, ["698"]);
  const taxeOperationale = sumSeriesBySymbols(yearRows, monthLabels, ["635", "6586"]);
  const cheltuieliDobanzi = sumSeriesBySymbols(yearRows, monthLabels, ["666"]);
  const cheltuieliCurs = sumSeriesBySymbols(yearRows, monthLabels, ["665"]);
  const amortizare = sumSeriesBySymbols(yearRows, monthLabels, ["6811"]);
  const amenziPenalitati = sumSeriesBySymbols(yearRows, monthLabels, ["6581"]);
  const sponsorizari = sumSeriesBySymbols(yearRows, monthLabels, ["6584"]);
  const cheltuieliNedeductibile = sumSeriesByLabels(yearRows, monthLabels, ["nedeductibile"]);
  const cheltuieliProtocol = sumSeriesBySymbols(yearRows, monthLabels, ["623"]);
  const combustibil = sumSeriesBySymbols(yearRows, monthLabels, ["6022"]);
  const utilitati = sumSeriesBySymbols(yearRows, monthLabels, ["605"]);

  const dividendeDePlata = sumSeriesBySymbols(yearRows, monthLabels, ["457"]);
  const miscariAsociati = sumSeriesBySymbols(yearRows, monthLabels, ["455", "456"]);
  const avansuriTrezorerie = sumSeriesBySymbols(yearRows, monthLabels, ["542"]);
  const miscariCasa = sumSeriesBySymbols(yearRows, monthLabels, ["531"]);
  const miscariBanca = sumSeriesBySymbols(yearRows, monthLabels, ["512"]);

  const totalVenituriYtd = sumSeries(venituriSeries);
  const totalCheltuieliYtd = sumSeries(cheltuieliSeries);
  const profitYtdRaw = sumSeries(profitSeries);
  const profitYtd = Number.isFinite(profitYtdRaw) && profitYtdRaw !== 0
    ? profitYtdRaw
    : totalVenituriYtd - totalCheltuieliYtd;
  const requestedElements = buildRequestedElementsAccountAnalysis(yearRows, monthLabels, {
    totalVenituri: totalVenituriYtd,
    totalCheltuieli: totalCheltuieliYtd,
    rezultat121: profitYtd
  });

  const lastMonthWithData = latestNonZeroPoint(venituriSeries) || latestNonZeroPoint(cheltuieliSeries) || latestNonZeroPoint(profitSeries);
  const activeMonthCount = getActiveMonthCount(venituriSeries, cheltuieliSeries, profitSeries, lastMonthWithData);
  const yearlyTrend = buildYearlyTrend(rows, sortedYears, activeMonthCount);
  const marjaNeta = safeDivide(profitYtd, totalVenituriYtd);
  const totalImpozite = impozitProfit.total + impozitMicro.total + taxeOperationale.total;
  const rataImpozitareDinVenituri = safeDivide(totalImpozite, totalVenituriYtd);
  const cashOutProxy = cheltuieliMarfa.total + cheltuieliPersonal.total + cheltuieliServicii.total + totalImpozite + cheltuieliDobanzi.total;
  const cashOutRatio = safeDivide(cashOutProxy, totalVenituriYtd);
  const pondereMarfa = safeDivide(cheltuieliMarfa.total, totalCheltuieliYtd);
  const ponderePersonal = safeDivide(cheltuieliPersonal.total, totalCheltuieliYtd);
  const pondereServicii = safeDivide(cheltuieliServicii.total, totalCheltuieliYtd);
  const pondereTaxe = safeDivide(totalImpozite, totalCheltuieliYtd);
  const marjaComerciala = safeDivide(cifraAfaceriEstimata.total - cheltuieliMarfa.total, cifraAfaceriEstimata.total);
  const rataDobanziDinVenituri = safeDivide(cheltuieliDobanzi.total, totalVenituriYtd);
  const pondereCheltuieliSensibile = safeDivide(
    amenziPenalitati.total + sponsorizari.total + cheltuieliNedeductibile.total + cheltuieliProtocol.total,
    totalCheltuieliYtd
  );
  const rataImpozitPeProfit = safeDivide(impozitProfit.total, Math.max(profitYtd, 0));

  const totalVenituriPrevYtd = sumSeries(prevVenituriSeries);
  const totalCheltuieliPrevYtd = sumSeries(prevCheltuieliSeries);
  const profitPrevYtdRaw = sumSeries(prevProfitSeries);
  const profitPrevYtd = Number.isFinite(profitPrevYtdRaw) && profitPrevYtdRaw !== 0
    ? profitPrevYtdRaw
    : totalVenituriPrevYtd - totalCheltuieliPrevYtd;
  const deltaVenituriYoY = totalVenituriYtd - totalVenituriPrevYtd;
  const deltaCheltuieliYoY = totalCheltuieliYtd - totalCheltuieliPrevYtd;
  const deltaProfitYoY = profitYtd - profitPrevYtd;
  const crestereVenituriYoY = safeDivide(deltaVenituriYoY, totalVenituriPrevYtd);
  const crestereCheltuieliYoY = safeDivide(deltaCheltuieliYoY, totalCheltuieliPrevYtd);
  const crestereProfitYoY = safeDivide(deltaProfitYoY, Math.abs(profitPrevYtd));

  const legalReserveEstimate = profitYtd > 0 ? profitYtd * 0.05 : 0;
  const potentialDividendsBeforeTax = profitYtd > 0 ? Math.max(profitYtd - legalReserveEstimate, 0) : 0;
  const dividendTaxEstimate = potentialDividendsBeforeTax * 0.10;
  const potentialDividendsNet = potentialDividendsBeforeTax - dividendTaxEstimate;

  const topExpenseAccounts = getTopAccountsByPrefix(yearRows, monthLabels, "6", 8);

  const alerts = [];
  if (marjaNeta !== null && marjaNeta < 0.03) {
    alerts.push("Marja neta sub 3%: compania este sensibila la socuri de cost sau vanzari.");
  }
  if (cashOutRatio !== null && cashOutRatio > 0.9) {
    alerts.push("Cash-out operational peste 90% din venituri: risc de tensiune pe lichiditate.");
  }
  if (pondereMarfa !== null && pondereMarfa > 0.75) {
    alerts.push("Pondere foarte mare a costului marfii in total cheltuieli: optimizarea achizitiilor este critica.");
  }
  if (amenziPenalitati.total > 0) {
    alerts.push("Exista amenzi/penalitati (6581): recomand verificarea conformarii fiscale si contractuale.");
  }
  if (rataImpozitPeProfit !== null && rataImpozitPeProfit > 0.30) {
    alerts.push("Impozit pe profit peste 30% din rezultatul net: verificati ajustari fiscale si deductibilitatea.");
  }

  const activeProfitSeries = lastMonthWithData
    ? sliceSeriesUntilMonth(profitSeries, lastMonthWithData.month)
    : profitSeries;
  const monthsWithProfit = activeProfitSeries.filter((point) => point.value > 0);
  const bestMonth = monthsWithProfit.length
    ? monthsWithProfit.reduce((best, point) => (point.value > best.value ? point : best), monthsWithProfit[0])
    : null;
  const worstMonth = activeProfitSeries.length
    ? activeProfitSeries.reduce((worst, point) => (point.value < worst.value ? point : worst), activeProfitSeries[0])
    : null;

  return {
    mode: "account-balance",
    latestYear: latestSheetName,
    totalVenituriYtd,
    totalCheltuieliYtd,
    profitYtd,
    marjaNeta,
    cifraAfaceriEstimata,
    cheltuieliMarfa,
    cheltuieliPersonal,
    cheltuieliServicii,
    impozitProfit,
    impozitMicro,
    taxeOperationale,
    cheltuieliDobanzi,
    cheltuieliCurs,
    amortizare,
    amenziPenalitati,
    sponsorizari,
    cheltuieliNedeductibile,
    cheltuieliProtocol,
    combustibil,
    utilitati,
    requestedElements,
    dividendeDePlata,
    miscariAsociati,
    avansuriTrezorerie,
    miscariCasa,
    miscariBanca,
    totalImpozite,
    rataImpozitareDinVenituri,
    cashOutProxy,
    cashOutRatio,
    pondereMarfa,
    ponderePersonal,
    pondereServicii,
    pondereTaxe,
    marjaComerciala,
    rataDobanziDinVenituri,
    pondereCheltuieliSensibile,
    rataImpozitPeProfit,
    previousYearName,
    totalVenituriPrevYtd,
    totalCheltuieliPrevYtd,
    profitPrevYtd,
    deltaVenituriYoY,
    deltaCheltuieliYoY,
    deltaProfitYoY,
    crestereVenituriYoY,
    crestereCheltuieliYoY,
    crestereProfitYoY,
    legalReserveEstimate,
    potentialDividendsBeforeTax,
    dividendTaxEstimate,
    potentialDividendsNet,
    topExpenseAccounts,
    alerts,
    bestMonth,
    worstMonth,
    monthLabels,
    venituriSeries,
    cheltuieliSeries,
    profitSeries,
    prevVenituriSeries,
    prevCheltuieliSeries,
    prevProfitSeries,
    activeMonthCount,
    yearlyTrend,
    lastMonthWithData,
    foundRows: standardValues,
    missingIndicators: Object.entries(standardValues)
      .filter(([, value]) => value === null || value === undefined)
      .map(([key]) => key)
  };
}

function findBestIndicatorValue(rows, indicator) {
  let bestMatch = null;

  rows.forEach((row) => {
    if (!row.cells.length) {
      return;
    }

    const rowText = normalizeText(row.cells.join(" "));
    const hasRowId = (indicator.rowIds || []).some((rowId) => rowContainsId(row.cells, rowId));
    const hasLabel = (indicator.labels || []).some((label) => rowText.includes(normalizeText(label)));
    const inHintSheet = (indicator.sheetHints || []).some((hint) => row.normalizedSheetName.includes(normalizeText(hint)));

    if (!hasRowId && !hasLabel) {
      return;
    }

    const rowIdIndex = findRowIdIndex(row.cells, indicator.rowIds || []);
    const value = extractAmountFromRow(row.cells, rowIdIndex, indicator.rowIds || []);

    if (!Number.isFinite(value)) {
      return;
    }

    const score = (hasRowId ? 3 : 0) + (hasLabel ? 4 : 0) + (inHintSheet ? 2 : 0);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { score, value };
    }
  });

  return bestMatch ? bestMatch.value : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[().,:;-]/g, "")
    .replace(/nr\.?rd\.?/g, "rd");
}

function normalizeRowId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.replace(/^0+/, "") || "0";
}

function rowContainsId(cells, rowId) {
  const target = normalizeRowId(rowId);

  return cells.some((cell) => {
    const candidate = normalizeText(cell);
    if (!candidate) {
      return false;
    }

    if (/^rd\d{1,3}$/.test(candidate)) {
      return normalizeRowId(candidate.replace("rd", "")) === target;
    }

    if (/^\d{1,3}$/.test(candidate)) {
      return normalizeRowId(candidate) === target;
    }

    return false;
  });
}

function findRowIdIndex(cells, rowIds) {
  for (let i = 0; i < cells.length; i += 1) {
    const candidate = normalizeText(cells[i]);
    if (!candidate) {
      continue;
    }

    const isSimpleNumeric = /^\d{1,3}$/.test(candidate);
    const isRdPattern = /^rd\d{1,3}$/.test(candidate);
    if (!isSimpleNumeric && !isRdPattern) {
      continue;
    }

    const candidateId = normalizeRowId(isRdPattern ? candidate.replace("rd", "") : candidate);
    const match = rowIds.some((rowId) => normalizeRowId(rowId) === candidateId);
    if (match) {
      return i;
    }
  }

  return -1;
}

function extractAmountFromRow(cells, rowIdIndex, rowIds) {
  const targetIds = rowIds.map((rowId) => normalizeRowId(rowId));
  const numericCells = [];

  cells.forEach((cell, index) => {
    const parsed = parseNumber(cell);
    if (!Number.isFinite(parsed)) {
      return;
    }

    numericCells.push({ index, value: parsed, raw: String(cell || "").trim() });
  });

  if (!numericCells.length) {
    return NaN;
  }

  const candidates = numericCells.filter(({ index, value, raw }) => {
    if (rowIdIndex >= 0 && index <= rowIdIndex) {
      return false;
    }

    const normalizedRaw = normalizeText(raw);
    if (/^rd?\d{1,3}$/.test(normalizedRaw)) {
      const onlyDigits = normalizeRowId(normalizedRaw.replace("rd", ""));
      if (targetIds.includes(onlyDigits)) {
        return false;
      }
    }

    if (Math.abs(value) < 1 && /^\d{1,3}$/.test(normalizedRaw)) {
      return false;
    }

    return true;
  });

  const selected = candidates.length ? candidates : numericCells;
  return selected[selected.length - 1].value;
}

function parseNumber(raw) {
  if (typeof raw === "number") {
    return raw;
  }

  const text = String(raw || "").trim();
  if (!text) {
    return NaN;
  }

  const cleaned = text
    .replace(/\s/g, "")
    .replace(/lei|ron/gi, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/[^0-9.-]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === ".") {
    return NaN;
  }

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function findRowByLabel(rows, labels) {
  return rows.find((row) => {
    const text = normalizeText((row.cells || []).join(" "));
    return labels.some((label) => text.includes(normalizeText(label)));
  }) || null;
}

function findRowBySymbolOrLabel(rows, symbols, labels) {
  return rows.find((row) => {
    const symbol = normalizeText((row.cells && row.cells[0]) || "");
    const text = normalizeText((row.cells || []).join(" "));

    const symbolMatch = symbols.some((sym) => normalizeText(sym) === symbol);
    const labelMatch = labels.some((label) => text.includes(normalizeText(label)));
    return symbolMatch || labelMatch;
  }) || null;
}

function extractSeriesFromRow(row, monthLabels) {
  if (!row || !row.cells) {
    return [];
  }

  const values = row.cells.slice(2);
  return values.map((cell, idx) => ({
    month: monthLabels[idx] || `Luna ${idx + 1}`,
    value: parseNumber(cell)
  })).filter((point) => Number.isFinite(point.value) && isMonthLike(point.month));
}

function sumSeriesBySymbols(rows, monthLabels, symbolPrefixes) {
  const normalizedPrefixes = symbolPrefixes.map((prefix) => String(prefix || "").toLowerCase());
  const matchedSymbols = [];
  let total = 0;

  rows.forEach((row) => {
    const symbol = String((row.cells && row.cells[0]) || "").trim().toLowerCase();
    if (!symbol) {
      return;
    }

    const isMatch = normalizedPrefixes.some((prefix) => symbol.startsWith(prefix));
    if (!isMatch) {
      return;
    }

    const series = extractSeriesFromRow(row, monthLabels);
    const rowTotal = sumSeries(series);
    if (!Number.isFinite(rowTotal) || rowTotal === 0) {
      return;
    }

    total += rowTotal;
    matchedSymbols.push(symbol);
  });

  return {
    total,
    matchedSymbols: [...new Set(matchedSymbols)]
  };
}

function normalizeAccountingSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,+/g, ".");
}

function sumSeriesBySymbolRules(rows, monthLabels, rules) {
  let total = 0;

  rows.forEach((row) => {
    const rowSymbol = normalizeAccountingSymbol((row.cells && row.cells[0]) || "");
    if (!rowSymbol) {
      return;
    }

    const isMatch = rules.some((rule) => {
      const target = normalizeAccountingSymbol(rule.value);
      if (!target) {
        return false;
      }

      if (rule.mode === "exact") {
        return rowSymbol === target;
      }

      return rowSymbol.startsWith(target);
    });

    if (!isMatch) {
      return;
    }

    total += sumSeries(extractSeriesFromRow(row, monthLabels));
  });

  return total;
}

function buildRequestedElementsAccountAnalysis(rows, monthLabels, totals) {
  const items = [
    { label: "121 Profit sau pierdere", total: totals.rezultat121 || 0 },
    { label: "Total venituri", total: totals.totalVenituri || 0 },
    { label: "Total cheltuieli", total: totals.totalCheltuieli || 0 },
    { label: "707 Vanzari marfa", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "707", mode: "prefix" }]) },
    { label: "607 Cheltuieli marfa", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "607", mode: "prefix" }]) },
    { label: "709 Reduceri acordate clientilor", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "709", mode: "prefix" }]) },
    { label: "609 Discount marfa", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "609", mode: "prefix" }]) },
    { label: "704 Venituri din servicii prestate", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "704", mode: "prefix" }]) },
    { label: "706 Venituri din chirie", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "706", mode: "prefix" }]) },
    { label: "7583 Venituri din vanzari active", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "7583", mode: "prefix" }]) },
    { label: "7651 Diferente de curs valutar (venit)", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "7651", mode: "prefix" }]) },
    { label: "7588 Venituri din inchidere sold furnizori", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "7588", mode: "prefix" }]) },
    { label: "6022 Cheltuieli combustibili", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6022", mode: "prefix" }]) },
    { label: "6024 Cheltuieli piese de schimb", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6024", mode: "prefix" }]) },
    { label: "6028 Cheltuieli alte materiale consumabile", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6028", mode: "prefix" }]) },
    { label: "603 Cheltuieli materiale de natura obiectelor de inventar", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "603", mode: "prefix" }]) },
    { label: "604 Cheltuieli materiale nestocate", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "604", mode: "prefix" }]) },
    { label: "605 Cheltuieli energie si apa", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "605", mode: "prefix" }]) },
    { label: "611 Cheltuieli cu intretinerea si reparatiile", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "611", mode: "prefix" }]) },
    { label: "612 Cheltuieli redevente/locatii/chirii", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "612", mode: "prefix" }]) },
    { label: "613 Cheltuieli prime de asigurare", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "613", mode: "prefix" }]) },
    { label: "622 Cheltuieli comisioane si onorarii", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "622", mode: "prefix" }]) },
    { label: "623 Cheltuieli protocol/reclama/publicitate", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "623", mode: "prefix" }]) },
    { label: "624 Cheltuieli transport bunuri si personal", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "624", mode: "prefix" }]) },
    { label: "625 Cheltuieli deplasari/detasari/transferari", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "625", mode: "prefix" }]) },
    { label: "626 Cheltuieli postale si telecomunicatii", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "626", mode: "prefix" }]) },
    { label: "627 Cheltuieli servicii bancare", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "627", mode: "prefix" }]) },
    { label: "628 Alte cheltuieli cu servicii executate de terti", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "628", mode: "prefix" }]) },
    { label: "635 Cheltuieli cu alte impozite/taxe", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "635", mode: "prefix" }]) },
    { label: "641 Cheltuieli cu salariile personalului", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "641", mode: "prefix" }]) },
    { label: "6458 Alte cheltuieli privind vacante salariati", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6458", mode: "prefix" }]) },
    { label: "654 Pierderi din creante si debitori diversi", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "654", mode: "prefix" }]) },
    { label: "6581.01 Amenzi si penalitati ANAF", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6581.01", mode: "exact" }]) },
    { label: "6581.02 Penalitati firme", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6581.02", mode: "exact" }]) },
    { label: "6583 Cheltuieli din vanzare imobilizari", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6583", mode: "prefix" }]) },
    { label: "6584 Cheltuieli cu sponsorizari/donatii", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6584", mode: "prefix" }]) },
    { label: "6588 Alte cheltuieli de exploatare", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6588", mode: "prefix" }]) },
    { label: "665 Cheltuieli din diferente de curs valutar", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "665", mode: "prefix" }]) },
    { label: "666 Cheltuieli privind dobanzile", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "666", mode: "prefix" }]) },
    { label: "6811 Cheltuieli cu amortizarea imobilizarilor", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "6811", mode: "prefix" }]) },
    { label: "691 Cheltuieli cu impozitul pe profit", total: sumSeriesBySymbolRules(rows, monthLabels, [{ value: "691", mode: "prefix" }]) }
  ];

  const sold707 = items.find((item) => item.label.startsWith("707 "))?.total || 0;
  const sold607 = items.find((item) => item.label.startsWith("607 "))?.total || 0;
  const sold709 = items.find((item) => item.label.startsWith("709 "))?.total || 0;
  const sold609 = items.find((item) => item.label.startsWith("609 "))?.total || 0;
  const totalCheltDiverseByLabel = sumSeriesByLabels(rows, monthLabels, ["total cheltuieli diverse"]).total;
  const totalCheltDiverseFallback = sumSeriesBySymbolRules(rows, monthLabels, [{ value: "658", mode: "prefix" }]);

  items.splice(7, 0, {
    label: "Adaos marfa (707 - 607 - 709 + 609)",
    total: sold707 - sold607 - sold709 + sold609
  });

  items.push({
    label: "Total cheltuieli diverse",
    total: totalCheltDiverseByLabel !== 0 ? totalCheltDiverseByLabel : totalCheltDiverseFallback
  });

  return items;
}

function sumPdfBySymbolRules(rows, rules) {
  return rules.reduce((sum, rule) => {
    const symbol = normalizeAccountingSymbol(rule.value);
    if (!symbol) {
      return sum;
    }

    const matchedRows = rule.mode === "exact"
      ? rows.filter((row) => normalizeAccountingSymbol(row.symbol) === symbol)
      : resolveRowsForPrefix(rows, symbol);

    return sum + matchedRows.reduce((acc, row) => {
      if (rule.side === "credit") {
        return acc + row.rulajCred;
      }

      return acc + row.rulajDeb;
    }, 0);
  }, 0);
}

function buildRequestedElementsPdfAnalysis(rows, totals) {
  const items = [
    { label: "121 Profit sau pierdere", total: totals.rezultat121 || 0 },
    { label: "Total venituri", total: totals.totalVenituri || 0 },
    { label: "Total cheltuieli", total: totals.totalCheltuieli || 0 },
    { label: "707 Vanzari marfa", total: sumPdfBySymbolRules(rows, [{ value: "707", mode: "prefix", side: "credit" }]) },
    { label: "607 Cheltuieli marfa", total: sumPdfBySymbolRules(rows, [{ value: "607", mode: "prefix", side: "debit" }]) },
    { label: "709 Reduceri acordate clientilor", total: sumPdfBySymbolRules(rows, [{ value: "709", mode: "prefix", side: "credit" }]) },
    { label: "609 Discount marfa", total: sumPdfBySymbolRules(rows, [{ value: "609", mode: "prefix", side: "credit" }]) },
    { label: "704 Venituri din servicii prestate", total: sumPdfBySymbolRules(rows, [{ value: "704", mode: "prefix", side: "credit" }]) },
    { label: "706 Venituri din chirie", total: sumPdfBySymbolRules(rows, [{ value: "706", mode: "prefix", side: "credit" }]) },
    { label: "7583 Venituri din vanzari active", total: sumPdfBySymbolRules(rows, [{ value: "7583", mode: "prefix", side: "credit" }]) },
    { label: "7651 Diferente de curs valutar (venit)", total: sumPdfBySymbolRules(rows, [{ value: "7651", mode: "prefix", side: "credit" }]) },
    { label: "7588 Venituri din inchidere sold furnizori", total: sumPdfBySymbolRules(rows, [{ value: "7588", mode: "prefix", side: "credit" }]) },
    { label: "6022 Cheltuieli combustibili", total: sumPdfBySymbolRules(rows, [{ value: "6022", mode: "prefix", side: "debit" }]) },
    { label: "6024 Cheltuieli piese de schimb", total: sumPdfBySymbolRules(rows, [{ value: "6024", mode: "prefix", side: "debit" }]) },
    { label: "6028 Cheltuieli alte materiale consumabile", total: sumPdfBySymbolRules(rows, [{ value: "6028", mode: "prefix", side: "debit" }]) },
    { label: "603 Cheltuieli materiale de natura obiectelor de inventar", total: sumPdfBySymbolRules(rows, [{ value: "603", mode: "prefix", side: "debit" }]) },
    { label: "604 Cheltuieli materiale nestocate", total: sumPdfBySymbolRules(rows, [{ value: "604", mode: "prefix", side: "debit" }]) },
    { label: "605 Cheltuieli energie si apa", total: sumPdfBySymbolRules(rows, [{ value: "605", mode: "prefix", side: "debit" }]) },
    { label: "611 Cheltuieli cu intretinerea si reparatiile", total: sumPdfBySymbolRules(rows, [{ value: "611", mode: "prefix", side: "debit" }]) },
    { label: "612 Cheltuieli redevente/locatii/chirii", total: sumPdfBySymbolRules(rows, [{ value: "612", mode: "prefix", side: "debit" }]) },
    { label: "613 Cheltuieli prime de asigurare", total: sumPdfBySymbolRules(rows, [{ value: "613", mode: "prefix", side: "debit" }]) },
    { label: "622 Cheltuieli comisioane si onorarii", total: sumPdfBySymbolRules(rows, [{ value: "622", mode: "prefix", side: "debit" }]) },
    { label: "623 Cheltuieli protocol/reclama/publicitate", total: sumPdfBySymbolRules(rows, [{ value: "623", mode: "prefix", side: "debit" }]) },
    { label: "624 Cheltuieli transport bunuri si personal", total: sumPdfBySymbolRules(rows, [{ value: "624", mode: "prefix", side: "debit" }]) },
    { label: "625 Cheltuieli deplasari/detasari/transferari", total: sumPdfBySymbolRules(rows, [{ value: "625", mode: "prefix", side: "debit" }]) },
    { label: "626 Cheltuieli postale si telecomunicatii", total: sumPdfBySymbolRules(rows, [{ value: "626", mode: "prefix", side: "debit" }]) },
    { label: "627 Cheltuieli servicii bancare", total: sumPdfBySymbolRules(rows, [{ value: "627", mode: "prefix", side: "debit" }]) },
    { label: "628 Alte cheltuieli cu servicii executate de terti", total: sumPdfBySymbolRules(rows, [{ value: "628", mode: "prefix", side: "debit" }]) },
    { label: "635 Cheltuieli cu alte impozite/taxe", total: sumPdfBySymbolRules(rows, [{ value: "635", mode: "prefix", side: "debit" }]) },
    { label: "641 Cheltuieli cu salariile personalului", total: sumPdfBySymbolRules(rows, [{ value: "641", mode: "prefix", side: "debit" }]) },
    { label: "6458 Alte cheltuieli privind vacante salariati", total: sumPdfBySymbolRules(rows, [{ value: "6458", mode: "prefix", side: "debit" }]) },
    { label: "654 Pierderi din creante si debitori diversi", total: sumPdfBySymbolRules(rows, [{ value: "654", mode: "prefix", side: "debit" }]) },
    { label: "6581.01 Amenzi si penalitati ANAF", total: sumPdfBySymbolRules(rows, [{ value: "6581.01", mode: "exact", side: "debit" }]) },
    { label: "6581.02 Penalitati firme", total: sumPdfBySymbolRules(rows, [{ value: "6581.02", mode: "exact", side: "debit" }]) },
    { label: "6583 Cheltuieli din vanzare imobilizari", total: sumPdfBySymbolRules(rows, [{ value: "6583", mode: "prefix", side: "debit" }]) },
    { label: "6584 Cheltuieli cu sponsorizari/donatii", total: sumPdfBySymbolRules(rows, [{ value: "6584", mode: "prefix", side: "debit" }]) },
    { label: "6588 Alte cheltuieli de exploatare", total: sumPdfBySymbolRules(rows, [{ value: "6588", mode: "prefix", side: "debit" }]) },
    { label: "665 Cheltuieli din diferente de curs valutar", total: sumPdfBySymbolRules(rows, [{ value: "665", mode: "prefix", side: "debit" }]) },
    { label: "666 Cheltuieli privind dobanzile", total: sumPdfBySymbolRules(rows, [{ value: "666", mode: "prefix", side: "debit" }]) },
    { label: "6811 Cheltuieli cu amortizarea imobilizarilor", total: sumPdfBySymbolRules(rows, [{ value: "6811", mode: "prefix", side: "debit" }]) },
    { label: "691 Cheltuieli cu impozitul pe profit", total: sumPdfBySymbolRules(rows, [{ value: "691", mode: "prefix", side: "debit" }]) }
  ];

  const sold707 = items.find((item) => item.label.startsWith("707 "))?.total || 0;
  const sold607 = items.find((item) => item.label.startsWith("607 "))?.total || 0;
  const sold709 = items.find((item) => item.label.startsWith("709 "))?.total || 0;
  const sold609 = items.find((item) => item.label.startsWith("609 "))?.total || 0;

  items.splice(7, 0, {
    label: "Adaos marfa (707 - 607 - 709 + 609)",
    total: sold707 - sold607 - sold709 + sold609
  });

  items.push({
    label: "Total cheltuieli diverse",
    total: sumPdfBySymbolRules(rows, [{ value: "658", mode: "prefix", side: "debit" }])
  });

  return items;
}

function sumSeriesByLabels(rows, monthLabels, labelHints) {
  const normalizedHints = labelHints.map((hint) => normalizeText(hint));
  let total = 0;

  rows.forEach((row) => {
    const label = normalizeText((row.cells && row.cells[1]) || "");
    if (!label) {
      return;
    }

    const isMatch = normalizedHints.some((hint) => label.includes(hint));
    if (!isMatch) {
      return;
    }

    const series = extractSeriesFromRow(row, monthLabels);
    total += sumSeries(series);
  });

  return { total };
}

function getTopAccountsByPrefix(rows, monthLabels, prefix, limit) {
  const items = [];

  rows.forEach((row) => {
    const symbol = String((row.cells && row.cells[0]) || "").trim();
    if (!symbol || !symbol.startsWith(prefix)) {
      return;
    }

    const label = String((row.cells && row.cells[1]) || "").trim();
    const total = sumSeries(extractSeriesFromRow(row, monthLabels));
    if (!Number.isFinite(total) || total <= 0) {
      return;
    }

    items.push({ symbol, label: label || "(fara denumire)", total });
  });

  return items
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function getActiveMonthCount(venituriSeries, cheltuieliSeries, profitSeries, lastMonthWithData) {
  const maxLen = Math.max(venituriSeries.length, cheltuieliSeries.length, profitSeries.length);
  if (!lastMonthWithData) {
    return maxLen;
  }

  const idx = venituriSeries.findIndex((point) => normalizeText(point.month || "") === normalizeText(lastMonthWithData.month));
  if (idx >= 0) {
    return idx + 1;
  }

  return maxLen;
}

function buildYearlyTrend(rows, sortedYears, activeMonthCount) {
  return sortedYears.map((yearNumber) => {
    const sheetName = String(yearNumber);
    const yearRows = rows.filter((row) => String(row.sheetName) === sheetName);
    const headerRow = yearRows.find((row) => normalizeText((row.cells || []).join(" ")).includes("simboldenumire"));
    const monthLabels = headerRow && headerRow.cells.length > 2
      ? headerRow.cells.slice(2).map((value, index) => String(value || `Luna ${index + 1}`).trim() || `Luna ${index + 1}`)
      : [];

    const venituriRow = findRowByLabel(yearRows, ["total venituri"]);
    const cheltuieliRow = findRowByLabel(yearRows, ["total cheltuieli"]);
    const profitRow = findRowBySymbolOrLabel(yearRows, ["121"], ["profit sau pierdere"]);

    const venituriSeries = extractSeriesFromRow(venituriRow, monthLabels).slice(0, activeMonthCount);
    const cheltuieliSeries = extractSeriesFromRow(cheltuieliRow, monthLabels).slice(0, activeMonthCount);
    const profitSeries = extractSeriesFromRow(profitRow, monthLabels).slice(0, activeMonthCount);

    const totalVenituri = sumSeries(venituriSeries);
    const totalCheltuieli = sumSeries(cheltuieliSeries);
    const profitRaw = sumSeries(profitSeries);
    const profit = Number.isFinite(profitRaw) && profitRaw !== 0
      ? profitRaw
      : totalVenituri - totalCheltuieli;

    return {
      year: sheetName,
      totalVenituri,
      totalCheltuieli,
      profit
    };
  });
}

function isMonthLike(label) {
  const normalized = normalizeText(label || "");
  if (!normalized) {
    return false;
  }

  if (normalized.includes("total") || normalized.includes("cumulat") || normalized.includes("sold")) {
    return false;
  }

  return true;
}

function sumSeries(series) {
  return series.reduce((sum, point) => sum + point.value, 0);
}

function latestNonZeroPoint(series) {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(series[i].value) && series[i].value !== 0) {
      return series[i];
    }
  }
  return null;
}

function sliceSeriesUntilMonth(series, monthLabel) {
  const target = normalizeText(monthLabel || "");
  if (!target) {
    return series;
  }

  const index = series.findIndex((point) => normalizeText(point.month || "") === target);
  if (index < 0) {
    return series;
  }

  return series.slice(0, index + 1);
}

function safeDivide(a, b) {
  if (!b) {
    return null;
  }
  return a / b;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatRatio(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(2);
}

function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function renderEvolutionCharts(metrics) {
  if (!window.Chart || !chartsSection || !yearlyChartCanvas || !monthlyChartCanvas) {
    return;
  }

  clearCharts();

  if (metrics.mode !== "account-balance" || metrics.error) {
    chartsSection.hidden = true;
    return;
  }

  chartsSection.hidden = false;

  const yearlyLabels = metrics.yearlyTrend.map((item) => item.year);
  yearlyChartInstance = new Chart(yearlyChartCanvas, {
    type: "bar",
    data: {
      labels: yearlyLabels,
      datasets: [
        {
          label: "Venituri",
          data: metrics.yearlyTrend.map((item) => Math.round(item.totalVenituri)),
          backgroundColor: "rgba(15, 118, 110, 0.72)"
        },
        {
          label: "Cheltuieli",
          data: metrics.yearlyTrend.map((item) => Math.round(item.totalCheltuieli)),
          backgroundColor: "rgba(202, 90, 31, 0.72)"
        },
        {
          label: "Profit",
          data: metrics.yearlyTrend.map((item) => Math.round(item.profit)),
          backgroundColor: "rgba(31, 41, 55, 0.72)"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        title: { display: false }
      }
    }
  });

  const currMonths = metrics.venituriSeries.slice(0, metrics.activeMonthCount).map((point) => point.month);
  const prevVenituri = alignSeriesToMonths(metrics.prevVenituriSeries, currMonths);
  const prevCheltuieli = alignSeriesToMonths(metrics.prevCheltuieliSeries, currMonths);
  const prevProfit = alignSeriesToMonths(metrics.prevProfitSeries, currMonths);

  monthlyChartInstance = new Chart(monthlyChartCanvas, {
    type: "line",
    data: {
      labels: currMonths,
      datasets: [
        {
          label: `${metrics.latestYear} venituri`,
          data: metrics.venituriSeries.slice(0, metrics.activeMonthCount).map((point) => Math.round(point.value)),
          borderColor: "#0f766e",
          backgroundColor: "rgba(15, 118, 110, 0.18)",
          tension: 0.2
        },
        {
          label: `${metrics.previousYearName} venituri`,
          data: prevVenituri,
          borderColor: "#34d399",
          backgroundColor: "rgba(52, 211, 153, 0.12)",
          borderDash: [6, 4],
          tension: 0.2
        },
        {
          label: `${metrics.latestYear} profit`,
          data: metrics.profitSeries.slice(0, metrics.activeMonthCount).map((point) => Math.round(point.value)),
          borderColor: "#1f2937",
          backgroundColor: "rgba(31, 41, 55, 0.12)",
          tension: 0.2
        },
        {
          label: `${metrics.previousYearName} profit`,
          data: prevProfit,
          borderColor: "#6b7280",
          backgroundColor: "rgba(107, 114, 128, 0.12)",
          borderDash: [6, 4],
          tension: 0.2
        },
        {
          label: `${metrics.latestYear} cheltuieli`,
          data: metrics.cheltuieliSeries.slice(0, metrics.activeMonthCount).map((point) => Math.round(point.value)),
          borderColor: "#ca5a1f",
          backgroundColor: "rgba(202, 90, 31, 0.12)",
          tension: 0.2
        },
        {
          label: `${metrics.previousYearName} cheltuieli`,
          data: prevCheltuieli,
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245, 158, 11, 0.12)",
          borderDash: [6, 4],
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top" },
        title: { display: false }
      }
    }
  });
}

function alignSeriesToMonths(series, targetMonths) {
  const map = new Map(series.map((point) => [normalizeText(point.month || ""), point.value]));
  return targetMonths.map((month) => {
    const value = map.get(normalizeText(month || ""));
    return Number.isFinite(value) ? Math.round(value) : 0;
  });
}

function clearCharts() {
  if (yearlyChartInstance) {
    yearlyChartInstance.destroy();
    yearlyChartInstance = null;
  }

  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
    monthlyChartInstance = null;
  }
}

function buildRequestedElementLines(items) {
  const categoryOrder = [
    "rezultat",
    "venituri",
    "costMarfa",
    "opex",
    "financiar",
    "fiscal",
    "diverse",
    "altele"
  ];

  const categoryTitles = {
    rezultat: "A) Rezultat si totaluri",
    venituri: "B) Venituri comerciale si alte venituri",
    costMarfa: "C) Cost marfa, reduceri si adaos",
    opex: "D) Cheltuieli operationale",
    financiar: "E) Cheltuieli financiare",
    fiscal: "F) Cheltuieli fiscale si conformare",
    diverse: "G) Cheltuieli diverse",
    altele: "H) Alte elemente"
  };

  const grouped = new Map(categoryOrder.map((key) => [key, []]));

  (items || []).forEach((item) => {
    const category = classifyRequestedElement(item.label);
    grouped.get(category).push(item);
  });

  const lines = [];
  categoryOrder.forEach((key) => {
    const categoryItems = grouped.get(key);
    if (!categoryItems || !categoryItems.length) {
      return;
    }

    lines.push(categoryTitles[key]);
    categoryItems.forEach((item) => {
      lines.push(`- ${item.label}: ${formatCurrency(item.total)}`);
    });
    lines.push("");
  });

  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function classifyRequestedElement(label) {
  const text = String(label || "").toLowerCase();

  if (text.startsWith("total cheltuieli diverse")) {
    return "diverse";
  }

  if (text.startsWith("121 ") || text.startsWith("total venituri") || text.startsWith("total cheltuieli")) {
    return "rezultat";
  }

  if (text.includes("adaos marfa") || text.startsWith("607 ") || text.startsWith("609 ") || text.startsWith("709 ")) {
    return "costMarfa";
  }

  if (text.startsWith("707 ") || text.startsWith("704 ") || text.startsWith("706 ") || text.startsWith("7583 ") || text.startsWith("7651 ") || text.startsWith("7588 ")) {
    return "venituri";
  }

  if (text.startsWith("6022 ") || text.startsWith("6024 ") || text.startsWith("6028 ")
      || text.startsWith("603 ") || text.startsWith("604 ") || text.startsWith("605 ")
      || text.startsWith("611 ") || text.startsWith("612 ") || text.startsWith("613 ")
      || text.startsWith("622 ") || text.startsWith("623 ") || text.startsWith("624 ")
      || text.startsWith("625 ") || text.startsWith("626 ") || text.startsWith("627 ")
      || text.startsWith("628 ") || text.startsWith("641 ") || text.startsWith("6458 ")
      || text.startsWith("6811 ")) {
    return "opex";
  }

  if (text.startsWith("665 ") || text.startsWith("666 ")) {
    return "financiar";
  }

  if (text.startsWith("635 ") || text.startsWith("691 ") || text.startsWith("6581.01 ") || text.startsWith("6581.02 ")) {
    return "fiscal";
  }

  if (text.startsWith("654 ") || text.startsWith("6583 ") || text.startsWith("6584 ") || text.startsWith("6588 ")) {
    return "diverse";
  }

  return "altele";
}

function buildReport({ companyName, adminName, reportPeriod, metrics }) {
  if (metrics.mode === "pdf-balance") {
    if (metrics.error) {
      return [
        `Stimate/Stimata ${adminName},`,
        "",
        `Nu am putut genera analiza automata pentru ${companyName}, perioada ${reportPeriod}.`,
        `Motiv: ${metrics.error}`,
        "",
        "Cu stima,",
        "Sistem automat de raportare balanta"
      ].join("\n");
    }

    const rezultatLunarText = metrics.rezultatLunar >= 0 ? "profit" : "pierdere";
    const rezultatCumulatText = metrics.rezultatCumulat >= 0 ? "profit" : "pierdere";
    const topClienti = metrics.topClienti.length
      ? metrics.topClienti.map((item, index) => {
        const displayName = String(item.name || "").trim() || "(denumire neidentificata in PDF)";
        return `- ${index + 1}. ${item.symbol} ${displayName}: ${formatCurrency(item.value)}`;
      })
      : ["- Fara solduri semnificative pe clienti."];
    const topFurnizori = metrics.topFurnizori.length
      ? metrics.topFurnizori.map((item, index) => {
        const displayName = String(item.name || "").trim() || "(denumire neidentificata in PDF)";
        return `- ${index + 1}. ${item.symbol} ${displayName}: ${formatCurrency(item.value)}`;
      })
      : ["- Fara solduri semnificative pe furnizori."];
    const alertLines = metrics.alerts.length
      ? metrics.alerts.map((line) => `- ${line}`)
      : ["- Nu au fost identificate alerte majore pe regulile automate configurate."];
    const requestedElementLines = buildRequestedElementLines(metrics.requestedElements);

    return [
      `Stimate/Stimata ${adminName},`,
      "",
      `Mai jos aveti analiza financiara pentru ${companyName}, perioada ${reportPeriod}, pe baza balantei de verificare PDF/XLS.`,
      `- Companie identificata in document: ${metrics.metadata.company || "n/a"}`,
      `- Perioada identificata in document: ${metrics.metadata.period || "n/a"}`,
      "",
      "1) Performanta perioada curenta",
      `- Venituri lunare estimate (clasa 7): ${formatCurrency(metrics.venituriLunare)}`,
      `- Cheltuieli lunare estimate (clasa 6): ${formatCurrency(metrics.cheltuieliLunare)}`,
      `- Rezultat lunar (${rezultatLunarText}): ${formatCurrency(metrics.rezultatLunar)}`,
      `- Rezultat cumulat din cont 121 (${rezultatCumulatText}): ${formatCurrency(metrics.rezultatCumulat)}`,
      `- Marja lunara estimata: ${formatPercent(metrics.marjaLunara)}`,
      "",
      "2) Pozitie financiara estimata (sold final)",
      `- Active imobilizate nete: ${formatCurrency(metrics.activeImobilizateNet)}`,
      `- Stocuri nete: ${formatCurrency(metrics.stocuriNet)}`,
      `- Creante clienti nete: ${formatCurrency(metrics.creanteClientiNet)}`,
      `- Numerar si disponibilitati (banci + casa): ${formatCurrency(metrics.numerarBanciCasa)}`,
      `- Avansuri de trezorerie: ${formatCurrency(metrics.avansuriTrezorerie)}`,
      `- Datorii furnizori: ${formatCurrency(metrics.datoriiFurnizori)}`,
      `- Datorii fiscale: ${formatCurrency(metrics.datoriiFiscale)}`,
      `- Datorii salariale: ${formatCurrency(metrics.datoriiSalariale)}`,
      `- Credite pe termen scurt: ${formatCurrency(metrics.crediteScurte)}`,
      `- Capitaluri proprii estimate: ${formatCurrency(metrics.capitaluriProprii)}`,
      `- Trezorerie neta (cash - credite scurte): ${formatCurrency(metrics.trezorerieNeta)}`,
      "",
      "3) Indicatori de risc si lichiditate",
      `- Lichiditate imediata ((cash + creante) / datorii curente): ${formatRatio(metrics.lichiditateImediata)}`,
      `- Grad de indatorare (datorii estimate / capitaluri proprii): ${formatRatio(metrics.gradIndatorare)}`,
      `- Raport active estimate / datorii estimate: ${formatRatio(safeDivide(metrics.totalActiveEstimate, metrics.totalDatoriiEstimate))}`,
      "",
      "4) Iesiri de bani si fiscalitate (proxy)",
      `- Cheltuieli marfa (607) - rulaj lunar: ${formatCurrency(metrics.cheltMarfaLunar)}`,
      `- Cheltuieli personal (641-646) - rulaj lunar: ${formatCurrency(metrics.cheltPersonalLunar)}`,
      `- Cheltuieli servicii (611-628) - rulaj lunar: ${formatCurrency(metrics.cheltServiciiLunar)}`,
      `- Cheltuieli dobanzi (666) - rulaj lunar: ${formatCurrency(metrics.cheltDobanziLunar)}`,
      `- Taxe si impozite (635/691/698) - rulaj lunar: ${formatCurrency(metrics.cheltTaxeLunar)}`,
      `- Cash-out lunar estimat (proxy): ${formatCurrency(metrics.cashOutLunarProxy)}`,
      `- Impozit pe profit (691) lunar: ${formatCurrency(metrics.impozitProfitLunar)}`,
      `- Impozit pe dividende (446.01) sold: ${formatCurrency(metrics.impozitDividendeSold)}`,
      "",
      "5) Dividende si relatia cu asociatii",
      `- Dividende de plata (457) sold final: ${formatCurrency(metrics.dividendeDePlataSold)}`,
      `- Plati/reduceri dividende in perioada (457 rulaj debitor): ${formatCurrency(metrics.platiDividendeLunare)}`,
      `- Decontari cu asociatii (455/456) sold: ${formatCurrency(metrics.decontariAsociatiSold)}`,
      `- Creante din dividende repartizate (463) sold: ${formatCurrency(metrics.creanteDividende463)}`,
      "",
      "6) Top expuneri clienti (sold final debitor)",
      ...topClienti,
      "",
      "7) Top expuneri furnizori (sold final creditor)",
      ...topFurnizori,
      "",
      "8) Alerte automate",
      ...alertLines,

      "",
      "9) Analiza pe elementele solicitate",
      ...requestedElementLines,
      "",
      "Observatii:",
      "- Analiza este construita pe structura balantei de verificare (solduri si rulaje), nu pe situatii financiare anuale complete.",
      "- Interpretarea dividendelor necesita validare cu documente juridice si fiscale (AGA, declaratii, scadente).",
      "- Pentru decizii finale, recomand validare cu contabilul societatii.",
      "",
      "Cu stima,",
      "Sistem automat de raportare balanta"
    ].join("\n");
  }

  if (metrics.mode === "account-balance") {
    if (metrics.error) {
      return [
        `Stimate/Stimata ${adminName},`,
        "",
        `Nu am putut genera analiza automata pentru ${companyName}, perioada ${reportPeriod}.`,
        `Motiv: ${metrics.error}`,
        "",
        "Cu stima,",
        "Sistem automat de raportare balanta"
      ].join("\n");
    }

    const rezultat = metrics.profitYtd >= 0 ? "profit" : "pierdere";
    const lunaRaportata = metrics.lastMonthWithData ? metrics.lastMonthWithData.month : "n/a";
    const semnalDividende = metrics.dividendeDePlata.total > 0
      ? `Exista miscari pe cont 457 (dividende de plata): ${formatCurrency(metrics.dividendeDePlata.total)}.`
      : "Nu au fost detectate miscari pe cont 457 (dividende de plata) in perioada analizata.";
    const topExpenseLines = metrics.topExpenseAccounts.map(
      (item, index) => `- ${index + 1}. ${item.symbol} ${item.label}: ${formatCurrency(item.total)}`
    );
    const alertLines = metrics.alerts.length
      ? metrics.alerts.map((line) => `- ${line}`)
      : ["- Nu au fost identificate alerte majore pe regulile automate configurate."];
    const requestedElementLines = buildRequestedElementLines(metrics.requestedElements);

    return [
      `Stimate/Stimata ${adminName},`,
      "",
      `Mai jos aveti sinteza financiara pentru ${companyName}, perioada ${reportPeriod}, pe baza foii ${metrics.latestYear}:`,
      "",
      "1) Indicatori esentiali (YTD)",
      `- Total venituri: ${formatCurrency(metrics.totalVenituriYtd)}`,
      `- Total cheltuieli: ${formatCurrency(metrics.totalCheltuieliYtd)}`,
      `- Rezultat net estimat (${rezultat}): ${formatCurrency(metrics.profitYtd)}`,
      `- Marja neta estimata: ${formatPercent(metrics.marjaNeta)}`,
      `- Marja comerciala estimata ((70x - 607) / 70x): ${formatPercent(metrics.marjaComerciala)}`,
      "",
      "2) Evolutie fata de anul anterior (aceeasi structura de luni)",
      `- Venituri ${metrics.latestYear}: ${formatCurrency(metrics.totalVenituriYtd)} | ${metrics.previousYearName}: ${formatCurrency(metrics.totalVenituriPrevYtd)} | Delta: ${formatCurrency(metrics.deltaVenituriYoY)} (${formatPercent(metrics.crestereVenituriYoY)})`,
      `- Cheltuieli ${metrics.latestYear}: ${formatCurrency(metrics.totalCheltuieliYtd)} | ${metrics.previousYearName}: ${formatCurrency(metrics.totalCheltuieliPrevYtd)} | Delta: ${formatCurrency(metrics.deltaCheltuieliYoY)} (${formatPercent(metrics.crestereCheltuieliYoY)})`,
      `- Rezultat ${metrics.latestYear}: ${formatCurrency(metrics.profitYtd)} | ${metrics.previousYearName}: ${formatCurrency(metrics.profitPrevYtd)} | Delta: ${formatCurrency(metrics.deltaProfitYoY)} (${formatPercent(metrics.crestereProfitYoY)})`,
      "",
      "3) Structura costurilor si iesiri de bani (proxy)",
      `- Cifra de afaceri estimata din conturi 70x: ${formatCurrency(metrics.cifraAfaceriEstimata.total)}`,
      `- Cheltuieli marfa (607): ${formatCurrency(metrics.cheltuieliMarfa.total)} (${formatPercent(metrics.pondereMarfa)} din total cheltuieli)`,
      `- Cheltuieli personal (641-645): ${formatCurrency(metrics.cheltuieliPersonal.total)} (${formatPercent(metrics.ponderePersonal)} din total cheltuieli)`,
      `- Cheltuieli servicii externe (611-628): ${formatCurrency(metrics.cheltuieliServicii.total)} (${formatPercent(metrics.pondereServicii)} din total cheltuieli)`,
      `- Dobanzi (666): ${formatCurrency(metrics.cheltuieliDobanzi.total)} (${formatPercent(metrics.rataDobanziDinVenituri)} din venituri)`,
      `- Combustibil (6022): ${formatCurrency(metrics.combustibil.total)} | Utilitati (605): ${formatCurrency(metrics.utilitati.total)}`,
      `- Cash-out operational estimat (marfa + personal + servicii + taxe + dobanzi): ${formatCurrency(metrics.cashOutProxy)} (${formatPercent(metrics.cashOutRatio)} din venituri)`,
      "",
      "4) Impozit si fiscalitate",
      `- Impozit pe profit (691): ${formatCurrency(metrics.impozitProfit.total)}`,
      `- Impozit micro/alte impozite (698): ${formatCurrency(metrics.impozitMicro.total)}`,
      `- Taxe operationale (635/6586): ${formatCurrency(metrics.taxeOperationale.total)}`,
      `- Total povara fiscala urmarita: ${formatCurrency(metrics.totalImpozite)} (${formatPercent(metrics.rataImpozitareDinVenituri)} din venituri)`,
      `- Rata impozit/profit net estimat: ${formatPercent(metrics.rataImpozitPeProfit)}`,
      `- Cheltuieli sensibile (amenzi + sponsorizari + nedeductibile + protocol): ${formatCurrency(metrics.amenziPenalitati.total + metrics.sponsorizari.total + metrics.cheltuieliNedeductibile.total + metrics.cheltuieliProtocol.total)} (${formatPercent(metrics.pondereCheltuieliSensibile)} din total cheltuieli)`,
      "",
      "5) Dividende, asociati si conturi sensibile de iesiri",
      `- ${semnalDividende}`,
      `- Miscari cu asociatii/actionarii (455/456): ${formatCurrency(metrics.miscariAsociati.total)}`,
      `- Avansuri de trezorerie (542): ${formatCurrency(metrics.avansuriTrezorerie.total)}`,
      `- Miscari prin casa (531): ${formatCurrency(metrics.miscariCasa.total)}`,
      `- Miscari prin banca (512): ${formatCurrency(metrics.miscariBanca.total)}`,
      `- Capacitate teoretica dividende brute (profit - rezerva legala 5%): ${formatCurrency(metrics.potentialDividendsBeforeTax)}`,
      `- Estimare impozit dividende 10%: ${formatCurrency(metrics.dividendTaxEstimate)}`,
      `- Capacitate teoretica dividende nete: ${formatCurrency(metrics.potentialDividendsNet)}`,
      "",
      "6) Top cheltuieli pe cont",
      ...topExpenseLines,
      "",
      "7) Stadiu perioada",
      `- Ultima luna cu date nenule: ${lunaRaportata}`,
      `- Luna cu cel mai bun rezultat (cont 121): ${metrics.bestMonth ? `${metrics.bestMonth.month} (${formatCurrency(metrics.bestMonth.value)})` : "n/a"}`,
      `- Luna cu cel mai slab rezultat (cont 121): ${metrics.worstMonth ? `${metrics.worstMonth.month} (${formatCurrency(metrics.worstMonth.value)})` : "n/a"}`,
      "",
      "8) Analiza pe elementele solicitate",
      ...requestedElementLines,
      "",
      "9) Alerte automate",
      ...alertLines,
      "",
      "Observatii:",
      "- Fisierul incarcat este de tip balanta pe conturi.",
      "- Rezumatul este construit din randurile Total Venituri, Total Cheltuieli si cont 121 (Profit sau pierdere).",
      "- Capacitatea de dividende este o estimare tehnica si NU inlocuieste calculul legal (rezultat reportat, rezerve, pierderi anterioare, hotarari AGA, fiscalitate la zi).",
      "- Valorile pentru conturi sensibile (455/456/457/531/542/512) sunt semnale de analiza, nu concluzii automate de retragere numerar/dividend fara validare pe documente justificative.",
      "- Pentru raportare statutara, recomand validare cu contabilul societatii.",
      "",
      "Cu stima,",
      "Sistem automat de raportare balanta"
    ].join("\n");
  }

  const rezultat = metrics.profitNet >= 0 ? "profit" : "pierdere";
  const warnings = metrics.missingIndicators.length
    ? [
        "",
        "Avertizari de completitudine:",
        `- Nu au fost identificate automat unele randuri: ${metrics.missingIndicators.join(", ")}.`,
        "- Verifica fisierul sursa sau denumirile coloanelor/randurilor."
      ]
    : [];

  return [
    `Stimate/Stimata ${adminName},`,
    "",
    `Mai jos aveti sinteza indicatorilor esentiali pentru ${companyName}, perioada ${reportPeriod}:`,
    "",
    "1) Date financiare esentiale",
    `- Total active: ${formatCurrency(metrics.totalActive)}`,
    `- Active imobilizate: ${formatCurrency(metrics.activeImobilizate)}`,
    `- Active circulante: ${formatCurrency(metrics.activeCirculante)}`,
    `- Cheltuieli in avans: ${formatCurrency(metrics.cheltuieliInAvans)}`,
    `- Datorii curente: ${formatCurrency(metrics.datoriiCurente)}`,
    `- Datorii pe termen lung: ${formatCurrency(metrics.datoriiTermenLung)}`,
    `- Capitaluri proprii: ${formatCurrency(metrics.capitaluriProprii)}`,
    `- Total datorii (curente + termen lung): ${formatCurrency(metrics.totalDatorii)}`,
    "",
    "2) Date de performanta",
    `- Cifra de afaceri neta: ${formatCurrency(metrics.cifraAfaceri)}`,
    `- Rezultatul net (${rezultat}): ${formatCurrency(metrics.profitNet)}`,
    "",
    "3) Indicatori de analiza rapida",
    `- Fond de rulment (active circulante - datorii curente): ${formatCurrency(metrics.fondRulment)}`,
    `- Lichiditate curenta (active circulante / datorii curente): ${formatRatio(metrics.lichiditateCurenta)}`,
    `- Grad de indatorare (datorii totale / capitaluri proprii): ${formatRatio(metrics.gradIndatorare)}`,
    `- Solvabilitate (capitaluri proprii / total active): ${formatPercent(metrics.solvabilitate)}`,
    "",
    "Observatii:",
    "- Raportul este generat automat din fisierul incarcat, pe baza structurii datelor contabile identificate.",
    "- Pentru decizii finale, recomand verificare cu contabilul societatii.",
    ...warnings,
    "",
    "Cu stima,",
    "Sistem automat de raportare balanta"
  ].join("\n");
}
