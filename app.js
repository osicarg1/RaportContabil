const form = document.getElementById("input-form");
const reportOutput = document.getElementById("reportOutput");
const copyBtn = document.getElementById("copyBtn");
const mailtoLink = document.getElementById("mailtoLink");
const chartsSection = document.getElementById("chartsSection");
const yearlyChartCanvas = document.getElementById("yearlyChart");
const monthlyChartCanvas = document.getElementById("monthlyChart");

let yearlyChartInstance = null;
let monthlyChartInstance = null;

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

  const companyName = document.getElementById("companyName").value.trim();
  const adminName = document.getElementById("adminName").value.trim();
  const adminEmail = document.getElementById("adminEmail").value.trim();
  const reportPeriod = document.getElementById("reportPeriod").value.trim();
  const fileInput = document.getElementById("balanceFile");

  if (!fileInput.files || !fileInput.files[0]) {
    alert("Selecteaza un fisier de balanta pe conturi.");
    return;
  }

  try {
    const file = fileInput.files[0];
    const rows = await extractRows(file);
    const metrics = computeMetrics(rows);
    const report = buildReport({ companyName, adminName, reportPeriod, metrics });

    reportOutput.value = report;
    copyBtn.disabled = false;
    updateMailto(adminEmail, companyName, reportPeriod, report);
    renderEvolutionCharts(metrics);
  } catch (error) {
    console.error(error);
    alert("Nu am putut procesa fisierul. Verifica formatul si incearca din nou.");
    clearCharts();
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

async function extractRows(file) {
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

function computeMetrics(rows) {
  const values = {};

  Object.entries(indicatorDefinitions).forEach(([key, indicator]) => {
    const found = findBestIndicatorValue(rows, indicator);
    values[key] = found;
  });

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

function buildReport({ companyName, adminName, reportPeriod, metrics }) {
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
      "8) Alerte automate",
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
