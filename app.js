const STORAGE_KEY = "site-ledger-data-v1";
const SESSION_KEY = "site-tracker-session-v1";
const ALLOWED_USERS = [
  { username: "SAHIL123", password: "DAVID9529", name: "Sahil" },
  { username: "ARBAZ123", password: "BUCKY1081", name: "Arbaz" }
];

const state = loadState();
const moneyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
let voiceRecognition = null;
let lastVoiceField = null;

const views = {
  dashboard: "Dashboard",
  capital: "Company Capital",
  sites: "Sites & Clients",
  extraWorks: "Extra Site Works",
  wages: "Labour Wages",
  materials: "Material Expenses",
  payments: "Client Payments",
  bills: "Pending Payment Bills",
  schedule: "Schedule & Targets",
  progress: "Work Progress",
  updates: "Daily Updates"
};

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.value = today;
  });
  document.getElementById("monthFilter").value = currentMonth;
  document.getElementById("todayLabel").textContent = longDate(today);

  bindAuth();
  bindNavigation();
  bindForms();
  bindActions();
  bindVoice();
  updateAuthView();
  render();
});

function bindAuth() {
  document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);
  document.getElementById("lockApp").addEventListener("click", lockApp);
  document.getElementById("lockAppTop").addEventListener("click", lockApp);
}

function handleAuthSubmit(event) {
  event.preventDefault();
  const username = document.getElementById("authUser").value.trim().toUpperCase();
  const password = document.getElementById("authPass").value.trim();

  if (!username || !password) {
    showAuthMessage("Enter username and password.");
    return;
  }

  const user = ALLOWED_USERS.find((item) => item.username === username && item.password === password);
  if (user) {
    sessionStorage.setItem(SESSION_KEY, user.username);
    clearAuthForm();
    updateAuthView();
    return;
  }

  showAuthMessage("Wrong username or password.");
}

function updateAuthView() {
  const unlocked = Boolean(sessionStorage.getItem(SESSION_KEY));
  document.body.classList.toggle("app-locked", !unlocked);
  document.getElementById("authModeText").textContent = "Login to continue";
  document.getElementById("authSubmit").textContent = "Login";
  document.getElementById("confirmPassWrap")?.classList.add("is-hidden");
  document.getElementById("authPass").setAttribute("autocomplete", "current-password");
}

function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  clearAuthForm();
  updateAuthView();
}

function clearAuthForm() {
  document.getElementById("authForm").reset();
  showAuthMessage("");
}

function showAuthMessage(message) {
  document.getElementById("authMessage").textContent = message;
}

function bindVoice() {
  document.addEventListener("focusin", (event) => {
    if (isVoiceField(event.target)) {
      lastVoiceField = event.target;
    }
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceButton = document.getElementById("voiceButton");
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    setVoiceStatus("Voice recognition is not supported in this browser. Use Chrome or Edge.");
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "en-IN";
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 1;

  voiceButton.addEventListener("click", () => {
    try {
      setVoiceStatus("Listening...");
      voiceButton.classList.add("is-listening");
      voiceRecognition.start();
    } catch (error) {
      setVoiceStatus("Mic is already listening. Speak now.");
    }
  });

  voiceRecognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript.trim();
    handleVoiceText(transcript);
  });

  voiceRecognition.addEventListener("end", () => {
    voiceButton.classList.remove("is-listening");
  });

  voiceRecognition.addEventListener("error", (event) => {
    voiceButton.classList.remove("is-listening");
    setVoiceStatus(event.error === "not-allowed" ? "Allow microphone permission, then try again." : "Could not hear clearly. Try again.");
  });
}

function handleVoiceText(transcript) {
  const lower = transcript.toLowerCase();
  const targetView = voiceTargetView(lower);
  if (targetView) {
    activateView(targetView);
  }

  const activeForm = document.querySelector(".view.active form.entry-form");
  const filled = activeForm ? fillFormFromVoice(activeForm, lower) : 0;
  if (filled) {
    setVoiceStatus(`Heard: "${transcript}". Filled ${filled} detail${filled === 1 ? "" : "s"}.`);
    return;
  }

  if (isVoiceField(lastVoiceField)) {
    setFieldValue(lastVoiceField, transcript);
    setVoiceStatus(`Heard: "${transcript}". Filled selected field.`);
    return;
  }

  setVoiceStatus(`Heard: "${transcript}". Tap a field first or speak details like "amount 5000".`);
}

function voiceTargetView(text) {
  const targets = [
    { view: "wages", words: ["labour", "labor", "worker", "wage", "attendance"] },
    { view: "materials", words: ["material", "cement", "steel", "sand", "supplier"] },
    { view: "payments", words: ["payment", "client payment", "received"] },
    { view: "bills", words: ["bill", "pending"] },
    { view: "extraWorks", words: ["extra work", "extra site", "additional work"] },
    { view: "sites", words: ["site name", "client name", "contract"] },
    { view: "capital", words: ["capital"] },
    { view: "schedule", words: ["schedule", "target", "assigned"] },
    { view: "progress", words: ["progress", "completion", "stage"] },
    { view: "updates", words: ["daily update", "today work", "tomorrow plan", "weather"] }
  ];
  return targets.find((target) => target.words.some((word) => text.includes(word)))?.view || "";
}

function fillFormFromVoice(form, text) {
  const fieldMap = {
    capitalForm: [
      ["source", ["source", "note", "from"]],
      ["amount", ["amount", "rupees", "rs"]]
    ],
    siteForm: [
      ["name", ["site name", "site"]],
      ["client", ["client name", "client"]],
      ["phone", ["phone", "mobile", "number"]],
      ["location", ["location", "place", "area"]],
      ["contract", ["contract amount", "contract", "amount"]],
      ["status", ["status"]]
    ],
    extraWorkForm: [
      ["work", ["work name", "extra work", "work"]],
      ["approvedBy", ["approved by", "approved", "client"]],
      ["amount", ["amount", "rupees", "rs"]],
      ["note", ["note", "details", "detail"]]
    ],
    wageForm: [
      ["worker", ["labour name", "labor name", "worker name", "name"]],
      ["phone", ["mobile number", "mobile", "phone", "number"]],
      ["workType", ["work type", "work"]],
      ["attendance", ["attendance"]],
      ["days", ["days", "day"]],
      ["rate", ["rate", "wage", "payment"]],
      ["siteId", ["site name", "site"]]
    ],
    materialForm: [
      ["item", ["material", "item"]],
      ["supplier", ["supplier"]],
      ["billNo", ["bill number", "bill no", "bill"]],
      ["amount", ["amount", "rupees", "rs"]],
      ["siteId", ["site name", "site"]]
    ],
    paymentForm: [
      ["client", ["client"]],
      ["mode", ["mode", "payment mode"]],
      ["reference", ["reference", "receipt"]],
      ["amount", ["amount", "rupees", "rs"]],
      ["siteId", ["site name", "site"]]
    ],
    billForm: [
      ["party", ["party", "supplier", "contractor"]],
      ["detail", ["detail", "bill detail", "pending for"]],
      ["amount", ["amount", "rupees", "rs"]],
      ["siteId", ["site name", "site"]]
    ],
    progressForm: [
      ["stage", ["stage", "work"]],
      ["percent", ["completion", "percent", "percentage"]],
      ["notes", ["notes", "note"]],
      ["siteId", ["site name", "site"]]
    ],
    scheduleForm: [
      ["task", ["task", "work", "schedule"]],
      ["targetPercent", ["target percent", "target percentage", "target"]],
      ["assignedTo", ["assigned to", "assigned"]],
      ["status", ["status"]],
      ["notes", ["notes", "note"]],
      ["siteId", ["site name", "site"]]
    ],
    updateForm: [
      ["labourCount", ["labour count", "labor count", "workers"]],
      ["weather", ["weather"]],
      ["workDone", ["today work", "work done", "done"]],
      ["nextPlan", ["tomorrow plan", "next plan", "plan"]],
      ["siteId", ["site name", "site"]]
    ]
  };

  const fields = fieldMap[form.id] || [];
  let filled = 0;
  fields.forEach(([name, aliases], index) => {
    const nextAliases = fields.slice(index + 1).flatMap((field) => field[1]);
    const value = voiceValueAfter(text, aliases, nextAliases);
    const field = form.elements[name];
    if (value && field && setFieldValue(field, value)) {
      filled += 1;
    }
  });
  return filled;
}

function voiceValueAfter(text, aliases, nextAliases) {
  const starts = aliases
    .map((alias) => ({ alias, index: text.indexOf(alias) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!starts.length) return "";

  const start = starts[0].index + starts[0].alias.length;
  const next = nextAliases
    .map((alias) => text.indexOf(alias, start + 1))
    .filter((index) => index > start)
    .sort((a, b) => a - b)[0];
  return cleanVoiceValue(text.slice(start, next || undefined));
}

function cleanVoiceValue(value) {
  return value
    .replace(/\b(is|as|equals|equal to|rupees|rs|please|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function setFieldValue(field, value) {
  if (!field || field.type === "file" || field.type === "date" || field.type === "month") return false;
  if (field.tagName === "SELECT") {
    const match = Array.from(field.options).find((option) => option.textContent.toLowerCase().includes(value.toLowerCase()) || option.value.toLowerCase() === value.toLowerCase());
    if (!match) return false;
    field.value = match.value;
  } else if (field.type === "number") {
    const numeric = value.match(/\d+(\.\d+)?/);
    if (!numeric) return false;
    field.value = numeric[0];
  } else {
    field.value = value;
  }
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function isVoiceField(element) {
  return element && ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName) && element.type !== "file";
}

function setVoiceStatus(message) {
  const status = document.getElementById("voiceStatus");
  if (status) status.textContent = message;
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return normalizeState(JSON.parse(saved));
  }

  return normalizeState({
    capital: [],
    sites: [],
    extraWorks: [],
    wages: [],
    materials: [],
    payments: [],
    bills: [],
    schedule: [],
    progress: [],
    updates: []
  });
}

function normalizeState(data) {
  return {
    capital: Array.isArray(data.capital) ? data.capital : [],
    sites: Array.isArray(data.sites) ? data.sites : [],
    extraWorks: Array.isArray(data.extraWorks) ? data.extraWorks : [],
    wages: Array.isArray(data.wages) ? data.wages : [],
    materials: Array.isArray(data.materials) ? data.materials : [],
    payments: Array.isArray(data.payments) ? data.payments : [],
    bills: Array.isArray(data.bills) ? data.bills : [],
    schedule: Array.isArray(data.schedule) ? data.schedule : [],
    progress: Array.isArray(data.progress) ? data.progress : [],
    updates: Array.isArray(data.updates) ? data.updates : []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      activateView(button.dataset.view);
    });
  });

  document.querySelectorAll(".nav-jump").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });

  document.getElementById("siteFilter").addEventListener("change", render);
  document.getElementById("monthFilter").addEventListener("change", render);
}

function activateView(viewName) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(viewName).classList.add("active");
  document.getElementById("viewTitle").textContent = views[viewName];
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindForms() {
  bindForm("capitalForm", (data) => {
    state.capital.push({
      id: makeId(),
      date: data.date,
      type: data.type,
      source: data.source,
      amount: number(data.amount)
    });
  });

  bindForm("siteForm", (data) => {
    state.sites.push({
      id: makeId(),
      name: data.name,
      client: data.client,
      phone: data.phone,
      location: data.location,
      contract: number(data.contract),
      startDate: data.startDate,
      status: data.status
    });
  });

  bindForm("extraWorkForm", (data) => {
    state.extraWorks.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      work: data.work,
      approvedBy: data.approvedBy,
      note: data.note,
      amount: number(data.amount)
    });
  });

  bindForm("wageForm", async (data, form) => {
    const attendance = data.attendance || "Present";
    const days = attendance === "Absent" ? 0 : number(data.days);
    const photoFile = form.elements.photo?.files?.[0];
    state.wages.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      worker: data.worker,
      phone: data.phone,
      photo: photoFile ? await fileToDataUrl(photoFile) : "",
      attendance,
      workType: data.workType,
      days,
      rate: number(data.rate),
      amount: days * number(data.rate)
    });
  });

  bindForm("materialForm", (data) => {
    state.materials.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      item: data.item,
      supplier: data.supplier,
      billNo: data.billNo,
      amount: number(data.amount)
    });
  });

  bindForm("paymentForm", (data) => {
    const site = findSite(data.siteId);
    state.payments.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      client: data.client || site.client,
      mode: data.mode,
      reference: data.reference,
      amount: number(data.amount)
    });
  });

  bindForm("billForm", (data) => {
    state.bills.push({
      id: makeId(),
      date: data.date,
      dueDate: data.dueDate,
      siteId: data.siteId,
      party: data.party,
      detail: data.detail,
      amount: number(data.amount),
      status: "Pending"
    });
  });

  bindForm("scheduleForm", (data) => {
    state.schedule.push({
      id: makeId(),
      date: data.date,
      targetDate: data.targetDate,
      siteId: data.siteId,
      task: data.task,
      targetPercent: clamp(number(data.targetPercent || 100), 0, 100),
      assignedTo: data.assignedTo,
      status: data.status,
      notes: data.notes
    });
  });

  bindForm("progressForm", (data) => {
    state.progress.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      stage: data.stage,
      percent: clamp(number(data.percent), 0, 100),
      notes: data.notes
    });
  });

  bindForm("updateForm", async (data, form) => {
    const photoFiles = Array.from(form.elements.photos?.files || []);
    state.updates.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      labourCount: number(data.labourCount),
      weather: data.weather,
      workDone: data.workDone,
      nextPlan: data.nextPlan,
      photos: await filesToDataUrls(photoFiles)
    });
  });
}

function bindForm(formId, onSubmit) {
  const form = document.getElementById(formId);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.sites.length && formId !== "siteForm" && formId !== "capitalForm") {
      alert("Add at least one site first.");
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    await onSubmit(data, form);
    saveState();
    form.reset();
    form.querySelectorAll('input[type="date"]').forEach((input) => {
      input.value = today;
    });
    const days = form.querySelector('input[name="days"]');
    if (days) days.value = 1;
    render();
  });
}

function bindActions() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete]");
    if (!button) return;
    const [collection, id] = button.dataset.delete.split(":");
    state[collection] = state[collection].filter((item) => item.id !== id);
    saveState();
    render();
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-paid]");
    if (!button) return;
    const bill = state.bills.find((item) => item.id === button.dataset.paid);
    if (bill) {
      bill.status = "Paid";
      saveState();
      render();
    }
  });

  document.getElementById("resetDemo").addEventListener("click", () => {
    if (!confirm("Clear all saved data from this browser?")) return;
    Object.keys(state).forEach((key) => {
      state[key] = [];
    });
    saveState();
    render();
  });

  document.getElementById("exportCsv").addEventListener("click", exportCsv);
  document.getElementById("exportWord").addEventListener("click", exportWordReport);
  document.getElementById("exportExcel").addEventListener("click", exportExcelReport);
  document.getElementById("exportPdf").addEventListener("click", exportPdfReport);
  document.getElementById("printReport").addEventListener("click", printReportPreview);
  document.getElementById("closeReport").addEventListener("click", closeReportPreview);
}

function render() {
  renderSiteFilter();
  renderSiteSelects();
  renderDashboard();
  renderCapital();
  renderSites();
  renderExtraWorks();
  renderWages();
  renderMaterials();
  renderPayments();
  renderBills();
  renderSchedule();
  renderProgress();
  renderUpdates();
}

function renderSiteFilter() {
  const filter = document.getElementById("siteFilter");
  const selected = filter.value || "all";
  filter.innerHTML = '<option value="all">All sites</option>' + state.sites
    .map((site) => `<option value="${site.id}">${escapeHtml(site.name)}</option>`)
    .join("");
  filter.value = state.sites.some((site) => site.id === selected) ? selected : "all";
}

function renderSiteSelects() {
  const options = state.sites.length
    ? state.sites.map((site) => `<option value="${site.id}">${escapeHtml(site.name)} - ${escapeHtml(site.client)}</option>`).join("")
    : '<option value="">Add a site first</option>';

  document.querySelectorAll('select[name="siteId"]').forEach((select) => {
    const current = select.value;
    select.innerHTML = options;
    if (state.sites.some((site) => site.id === current)) {
      select.value = current;
    }
  });
}

function renderDashboard() {
  const capital = filtered(state.capital);
  const wages = filtered(state.wages);
  const materials = filtered(state.materials);
  const extraWorks = filtered(state.extraWorks);
  const payments = filtered(state.payments);
  const bills = filtered(state.bills).filter((bill) => bill.status !== "Paid");
  const paidBills = filtered(state.bills).filter((bill) => bill.status === "Paid");
  const capitalAdded = sum(capital.filter((item) => item.type === "add"), "amount");
  const capitalWithdrawn = sum(capital.filter((item) => item.type === "withdraw"), "amount");
  const companyCapital = capitalAdded - capitalWithdrawn;
  const usedPayment = sum(wages, "amount") + sum(materials, "amount") + sum(paidBills, "amount");
  const clientPending = visibleSites().reduce((total, site) => {
    const contract = siteTotalAmount(site.id);
    const paid = sum(state.payments.filter((item) => item.siteId === site.id), "amount");
    return total + Math.max(contract - paid, 0);
  }, 0);
  const cashInHand = companyCapital + sum(payments, "amount") - usedPayment;
  const todayWages = wages.filter((item) => item.date === today);
  const todayMaterials = materials.filter((item) => item.date === today);
  const selectedSite = selectedSiteName();

  document.getElementById("selectedSiteLine").textContent = selectedSite;
  document.getElementById("metricSiteSpend").textContent = formatMoney(sum(wages, "amount") + sum(materials, "amount"));
  document.getElementById("metricSpendLabour").textContent = formatMoney(sum(wages, "amount"));
  document.getElementById("metricSpendMaterials").textContent = formatMoney(sum(materials, "amount"));
  document.getElementById("metricTodayLabour").textContent = formatMoney(sum(todayWages, "amount"));
  document.getElementById("metricTodayWorkers").textContent = `${uniqueCount(todayWages, "worker")} workers`;
  document.getElementById("metricTodayMaterials").textContent = formatMoney(sum(todayMaterials, "amount"));
  document.getElementById("metricTodayItems").textContent = `${todayMaterials.length} items`;
  document.getElementById("metricCash").textContent = formatMoney(cashInHand);
  document.getElementById("metricCapital").textContent = formatMoney(companyCapital);
  document.getElementById("metricWages").textContent = formatMoney(sum(wages, "amount"));
  document.getElementById("metricMaterials").textContent = formatMoney(sum(materials, "amount"));
  document.getElementById("metricPayments").textContent = formatMoney(sum(payments, "amount"));
  document.getElementById("metricExtraWorks").textContent = formatMoney(sum(extraWorks, "amount"));
  document.getElementById("metricUsed").textContent = formatMoney(usedPayment);
  document.getElementById("metricBills").textContent = formatMoney(sum(bills, "amount"));
  document.getElementById("metricClientPending").textContent = formatMoney(clientPending);
  document.getElementById("todayEmptyCard").classList.toggle("is-hidden", Boolean(todayWages.length || todayMaterials.length));

  const rows = visibleSites().map((site) => {
    const contract = siteTotalAmount(site.id);
    const paid = sum(state.payments.filter((item) => item.siteId === site.id), "amount");
    const balance = contract ? contract - paid : 0;
    const progress = latestProgress(site.id);
    return `<tr>
      <td><strong>${escapeHtml(site.name)}</strong><br><span>${escapeHtml(site.location || "")}</span></td>
      <td>${escapeHtml(site.client)}</td>
      <td>${progressCell(progress.percent, progress.stage)}</td>
      <td class="amount">${contract ? formatMoney(balance) : "-"}</td>
    </tr>`;
  }).join("");
  document.getElementById("siteSummaryRows").innerHTML = rows || emptyRow(4);

  const updates = filtered(state.updates)
    .sort(byDateDesc)
    .slice(0, 5)
    .map(updateCard)
    .join("");
  document.getElementById("latestUpdates").innerHTML = updates || emptyCard("No daily updates yet.");

  const targets = filtered(state.schedule)
    .filter((item) => item.status !== "Done")
    .sort(byTargetDateAsc)
    .slice(0, 4)
    .map(targetCard)
    .join("");
  document.getElementById("targetRows").innerHTML = targets || emptyCard("No upcoming targets yet.");
}

function selectedSiteName() {
  const siteId = document.getElementById("siteFilter")?.value || "all";
  if (siteId === "all") return "All sites";
  const site = findSite(siteId);
  return site.name ? `${site.name}${site.location ? ` - ${site.location}` : ""}` : "Selected site";
}

function renderCapital() {
  const rows = filtered(state.capital).sort(byDateDesc).map((item) => {
    const isAdd = item.type === "add";
    return `<tr>
      <td>${dateText(item.date)}</td>
      <td><span class="status-pill ${isAdd ? "success-pill" : "warning-pill"}">${isAdd ? "Added" : "Withdrawn"}</span></td>
      <td>${escapeHtml(item.source)}</td>
      <td class="amount">${formatMoney(item.amount)}</td>
      <td><button class="delete-btn" data-delete="capital:${item.id}" type="button">Delete</button></td>
    </tr>`;
  }).join("");
  document.getElementById("capitalRows").innerHTML = rows || emptyRow(5);
}

function renderSites() {
  const rows = visibleSites().map((site) => `<tr>
    <td><strong>${escapeHtml(site.name)}</strong><br><span>${escapeHtml(site.location || "")}</span></td>
    <td>${escapeHtml(site.client)}</td>
    <td>${escapeHtml(site.phone || "-")}</td>
    <td class="amount">${site.contract ? formatMoney(site.contract) : "-"}</td>
    <td class="amount">${formatMoney(siteExtraTotal(site.id))}</td>
    <td class="amount">${formatMoney(siteTotalAmount(site.id))}</td>
    <td>${escapeHtml(site.status)}</td>
    <td><button class="delete-btn" data-delete="sites:${site.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("siteRows").innerHTML = rows || emptyRow(8);
}

function renderExtraWorks() {
  const rows = filtered(state.extraWorks).sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${siteName(item.siteId)}</td>
    <td><strong>${escapeHtml(item.work)}</strong><br><span>${escapeHtml(item.note || "")}</span></td>
    <td>${escapeHtml(item.approvedBy || "-")}</td>
    <td class="amount">${formatMoney(item.amount)}</td>
    <td><button class="delete-btn" data-delete="extraWorks:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("extraWorkRows").innerHTML = rows || emptyRow(6);
}

function renderWages() {
  const rows = filtered(state.wages).sort(byDateDesc).map((wage) => `<tr>
    <td>${dateText(wage.date)}</td>
    <td>${siteName(wage.siteId)}</td>
    <td>${labourCell(wage)}</td>
    <td>${escapeHtml(wage.phone || "-")}</td>
    <td><span class="status-pill ${attendanceClass(wage.attendance)}">${escapeHtml(wage.attendance || "Present")}</span></td>
    <td>${escapeHtml(wage.workType || "-")}</td>
    <td>${wage.days}</td>
    <td class="amount">${formatMoney(wage.amount)}</td>
    <td><button class="delete-btn" data-delete="wages:${wage.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("wageRows").innerHTML = rows || emptyRow(9);
}

function labourCell(wage) {
  const photo = wage.photo
    ? `<img class="labour-photo" src="${wage.photo}" alt="">`
    : `<span class="labour-avatar">${initials(wage.worker)}</span>`;
  return `<div class="labour-person">${photo}<strong>${escapeHtml(wage.worker)}</strong></div>`;
}

function attendanceClass(attendance) {
  if (attendance === "Absent") return "danger-pill";
  if (attendance === "Half day") return "warning-pill";
  return "success-pill";
}

function renderMaterials() {
  const rows = filtered(state.materials).sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${siteName(item.siteId)}</td>
    <td>${escapeHtml(item.item)}</td>
    <td>${escapeHtml(item.supplier || "-")}</td>
    <td>${escapeHtml(item.billNo || "-")}</td>
    <td class="amount">${formatMoney(item.amount)}</td>
    <td><button class="delete-btn" data-delete="materials:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("materialRows").innerHTML = rows || emptyRow(7);
}

function renderPayments() {
  const rows = filtered(state.payments).sort(byDateDesc).map((payment) => `<tr>
    <td>${dateText(payment.date)}</td>
    <td>${siteName(payment.siteId)}</td>
    <td>${escapeHtml(payment.client || "-")}</td>
    <td>${escapeHtml(payment.mode)}</td>
    <td>${escapeHtml(payment.reference || "-")}</td>
    <td class="amount">${formatMoney(payment.amount)}</td>
    <td><button class="delete-btn" data-delete="payments:${payment.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("paymentRows").innerHTML = rows || emptyRow(7);
}

function renderBills() {
  const rows = filtered(state.bills).filter((bill) => bill.status !== "Paid").sort(byDateDesc).map((bill) => `<tr>
    <td>${dateText(bill.date)}</td>
    <td>${bill.dueDate ? dateText(bill.dueDate) : "-"}</td>
    <td>${siteName(bill.siteId)}</td>
    <td>${escapeHtml(bill.party)}</td>
    <td>${escapeHtml(bill.detail || "-")}</td>
    <td class="amount">${formatMoney(bill.amount)}</td>
    <td>
      <button class="paid-btn" data-paid="${bill.id}" type="button">Paid</button>
      <button class="delete-btn" data-delete="bills:${bill.id}" type="button">Delete</button>
    </td>
  </tr>`).join("");
  document.getElementById("billRows").innerHTML = rows || emptyRow(7);
}

function renderSchedule() {
  const rows = filtered(state.schedule).sort(byTargetDateAsc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${dateText(item.targetDate)}</td>
    <td>${siteName(item.siteId)}</td>
    <td><strong>${escapeHtml(item.task)}</strong><br><span>${escapeHtml(item.notes || "")}</span></td>
    <td>${progressCell(item.targetPercent, "")}</td>
    <td>${escapeHtml(item.assignedTo || "-")}</td>
    <td><span class="status-pill ${scheduleStatusClass(item.status)}">${escapeHtml(item.status || "Planned")}</span></td>
    <td><button class="delete-btn" data-delete="schedule:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("scheduleRows").innerHTML = rows || emptyRow(8);
}

function targetCard(item) {
  return `<article class="activity-card target-card">
    <header>
      <div>
        <h4>${escapeHtml(item.task)}</h4>
        <time>${siteName(item.siteId)} | Target: ${dateText(item.targetDate)}</time>
      </div>
      <span class="status-pill ${scheduleStatusClass(item.status)}">${escapeHtml(item.status || "Planned")}</span>
    </header>
    <p><strong>Target:</strong> ${item.targetPercent || 0}% | <strong>Assigned:</strong> ${escapeHtml(item.assignedTo || "-")}</p>
    <p>${escapeHtml(item.notes || "")}</p>
  </article>`;
}

function scheduleStatusClass(status) {
  if (status === "Done") return "success-pill";
  if (status === "Delayed") return "danger-pill";
  if (status === "In Progress") return "warning-pill";
  return "neutral-pill";
}

function renderProgress() {
  const rows = filtered(state.progress).sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${siteName(item.siteId)}</td>
    <td>${escapeHtml(item.stage)}</td>
    <td>${progressCell(item.percent, "")}</td>
    <td>${escapeHtml(item.notes || "-")}</td>
    <td><button class="delete-btn" data-delete="progress:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("progressRows").innerHTML = rows || emptyRow(6);
}

function renderUpdates() {
  const rows = filtered(state.updates).sort(byDateDesc).map(updateCard).join("");
  document.getElementById("updateRows").innerHTML = rows || emptyCard("No daily updates yet.");
}

function updateCard(update) {
  const photos = Array.isArray(update.photos) ? update.photos : [];
  const gallery = photos.length
    ? `<div class="site-photo-grid">${photos.map((photo) => `<img src="${photo}" alt="Site update photo">`).join("")}</div>`
    : "";
  return `<article class="activity-card">
    <header>
      <div>
        <h4>${siteName(update.siteId)}</h4>
        <time>${dateText(update.date)} | Labour: ${update.labourCount || 0} | ${escapeHtml(update.weather || "Weather not set")} | Photos: ${photos.length}</time>
      </div>
      <button class="delete-btn" data-delete="updates:${update.id}" type="button">Delete</button>
    </header>
    <p><strong>Done:</strong> ${escapeHtml(update.workDone)}</p>
    <p><strong>Next:</strong> ${escapeHtml(update.nextPlan || "-")}</p>
    ${gallery}
  </article>`;
}

function filtered(collection) {
  const siteId = document.getElementById("siteFilter")?.value || "all";
  const month = document.getElementById("monthFilter")?.value || "";
  return collection.filter((item) => {
    const siteMatch = siteId === "all" || item.siteId === siteId || item.id === siteId;
    const monthMatch = !month || !item.date || item.date.startsWith(month) || item.startDate?.startsWith(month);
    return siteMatch && monthMatch;
  });
}

function visibleSites() {
  const siteId = document.getElementById("siteFilter")?.value || "all";
  return state.sites.filter((site) => siteId === "all" || site.id === siteId);
}

function latestProgress(siteId) {
  const latest = state.progress.filter((item) => item.siteId === siteId).sort(byDateDesc)[0];
  return latest || { percent: 0, stage: "Not started" };
}

function progressCell(percent, stage) {
  const safePercent = clamp(number(percent), 0, 100);
  return `<div><strong>${safePercent}%</strong> ${escapeHtml(stage || "")}<div class="progress-track"><div class="progress-bar" style="width:${safePercent}%"></div></div></div>`;
}

function exportCsv() {
  const sections = [
    ["capital", state.capital],
    ["sites", state.sites],
    ["extra_works", state.extraWorks],
    ["wages", state.wages.map(({ photo, ...row }) => ({ ...row, photo: photo ? "Saved in app" : "" }))],
    ["materials", state.materials],
    ["payments", state.payments],
    ["pending_bills", state.bills],
    ["schedule_targets", state.schedule],
    ["progress", state.progress],
    ["daily_updates", state.updates.map(({ photos, ...row }) => ({ ...row, photos: Array.isArray(photos) && photos.length ? `${photos.length} saved in app` : "" }))]
  ];

  const csv = sections.map(([name, rows]) => {
    if (!rows.length) return `${name}\nNo records\n`;
    const headers = Object.keys(rows[0]);
    const lines = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
    return `${name}\n${headers.join(",")}\n${lines.join("\n")}\n`;
  }).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hh-spaces-${today}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportWordReport() {
  downloadFile(reportDocumentHtml(), `hh-spaces-report-${today}.doc`, "application/msword");
}

function exportExcelReport() {
  downloadFile(reportWorkbookHtml(), `hh-spaces-report-${today}.xls`, "application/vnd.ms-excel");
}

function exportPdfReport() {
  const frame = document.getElementById("reportFrame");
  frame.srcdoc = reportDocumentHtml();
  document.getElementById("reportModal").classList.remove("is-hidden");
}

function printReportPreview() {
  const frame = document.getElementById("reportFrame");
  if (!frame.srcdoc) {
    frame.srcdoc = reportDocumentHtml();
  }
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
}

function closeReportPreview() {
  document.getElementById("reportModal").classList.add("is-hidden");
}

function reportDocumentHtml() {
  const report = buildReportData();
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>H&amp;H SPACES Report</title>
        <style>${reportCss()}</style>
      </head>
      <body>
        <h1>H&amp;H SPACES Report</h1>
        <p class="muted">Generated on ${longDate(today)} | ${escapeHtml(selectedSiteName())}</p>
        <section class="summary">${report.summary.map((item) => `<div><span>${item.label}</span><strong>${item.value}</strong></div>`).join("")}</section>
        ${reportSection("Site Summary", report.sites)}
        ${reportSection("Extra Site Works", report.extraWorks)}
        ${reportSection("Labour Wages", report.wages)}
        ${reportSection("Material Expenses", report.materials)}
        ${reportSection("Client Payments", report.payments)}
        ${reportSection("Pending Bills", report.bills)}
        ${reportSection("Schedule & Targets", report.schedule)}
        ${reportSection("Work Progress", report.progress)}
        ${reportSection("Daily Updates", report.updates)}
      </body>
    </html>`;
}

function reportWorkbookHtml() {
  const report = buildReportData();
  return `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>H&amp;H SPACES Excel Report</title></head>
      <body>
        <h1>H&amp;H SPACES Report</h1>
        ${excelTable("Summary", report.summary.map((item) => ({ Particular: item.label, Amount: item.value })))}
        ${excelTable("Site Summary", report.sites)}
        ${excelTable("Extra Site Works", report.extraWorks)}
        ${excelTable("Labour Wages", report.wages)}
        ${excelTable("Material Expenses", report.materials)}
        ${excelTable("Client Payments", report.payments)}
        ${excelTable("Pending Bills", report.bills)}
        ${excelTable("Schedule Targets", report.schedule)}
        ${excelTable("Work Progress", report.progress)}
        ${excelTable("Daily Updates", report.updates)}
      </body>
    </html>`;
}

function buildReportData() {
  const wages = filtered(state.wages);
  const materials = filtered(state.materials);
  const extraWorks = filtered(state.extraWorks);
  const payments = filtered(state.payments);
  const pendingBills = filtered(state.bills).filter((bill) => bill.status !== "Paid");
  const paidBills = filtered(state.bills).filter((bill) => bill.status === "Paid");
  const capital = filtered(state.capital);
  const capitalTotal = sum(capital.filter((item) => item.type === "add"), "amount") - sum(capital.filter((item) => item.type === "withdraw"), "amount");
  const used = sum(wages, "amount") + sum(materials, "amount") + sum(paidBills, "amount");
  const received = sum(payments, "amount");
  const cash = capitalTotal + received - used;

  return {
    summary: [
      { label: "Cash In Hand", value: formatMoney(cash) },
      { label: "Company Capital", value: formatMoney(capitalTotal) },
      { label: "Client Payments", value: formatMoney(received) },
      { label: "Extra Site Works", value: formatMoney(sum(extraWorks, "amount")) },
      { label: "Payment Used", value: formatMoney(used) },
      { label: "Pending Bills", value: formatMoney(sum(pendingBills, "amount")) },
      { label: "Labour Wages", value: formatMoney(sum(wages, "amount")) },
      { label: "Material Expenses", value: formatMoney(sum(materials, "amount")) }
    ],
    sites: visibleSites().map((site) => {
      const paid = sum(state.payments.filter((item) => item.siteId === site.id), "amount");
      const extra = siteExtraTotal(site.id);
      const total = siteTotalAmount(site.id);
      return {
        Site: site.name,
        Client: site.client,
        Phone: site.phone || "",
        Location: site.location || "",
        Contract: formatMoney(site.contract),
        "Extra Work": formatMoney(extra),
        "Total Amount": formatMoney(total),
        Received: formatMoney(paid),
        Balance: formatMoney(total - paid),
        Status: site.status
      };
    }),
    extraWorks: extraWorks.map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Work: item.work,
      "Approved By": item.approvedBy || "",
      Note: item.note || "",
      Amount: formatMoney(item.amount)
    })),
    wages: wages.map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Labour: item.worker,
      Phone: item.phone || "",
      Attendance: item.attendance || "Present",
      Work: item.workType || "",
      Days: item.days,
      Rate: formatMoney(item.rate),
      Amount: formatMoney(item.amount)
    })),
    materials: materials.map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Material: item.item,
      Supplier: item.supplier || "",
      Bill: item.billNo || "",
      Amount: formatMoney(item.amount)
    })),
    payments: payments.map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Client: item.client || "",
      Mode: item.mode,
      Reference: item.reference || "",
      Amount: formatMoney(item.amount)
    })),
    bills: pendingBills.map((item) => ({
      Date: dateText(item.date),
      Due: item.dueDate ? dateText(item.dueDate) : "",
      Site: plainSiteName(item.siteId),
      Party: item.party,
      Detail: item.detail || "",
      Amount: formatMoney(item.amount)
    })),
    schedule: filtered(state.schedule).map((item) => ({
      Plan: dateText(item.date),
      Target: dateText(item.targetDate),
      Site: plainSiteName(item.siteId),
      Work: item.task,
      "Target %": item.targetPercent,
      Assigned: item.assignedTo || "",
      Status: item.status,
      Notes: item.notes || ""
    })),
    progress: filtered(state.progress).map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Stage: item.stage,
      Progress: `${item.percent}%`,
      Notes: item.notes || ""
    })),
    updates: filtered(state.updates).map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Labour: item.labourCount || 0,
      Weather: item.weather || "",
      WorkDone: item.workDone,
      NextPlan: item.nextPlan || "",
      Photos: Array.isArray(item.photos) ? item.photos.length : 0
    }))
  };
}

function reportSection(title, rows) {
  return `<h2>${escapeHtml(title)}</h2>${reportTable(rows)}`;
}

function reportTable(rows) {
  if (!rows.length) return `<p class="muted">No records.</p>`;
  const headers = Object.keys(rows[0]);
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function excelTable(title, rows) {
  return `<h2>${escapeHtml(title)}</h2>${reportTable(rows)}`;
}

function reportCss() {
  return `body{font-family:Arial,sans-serif;color:#17152f;margin:28px}h1{color:#4f46e5}h2{margin-top:26px;color:#312e81}.muted{color:#6f7285}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.summary div{border:1px solid #e6e3f4;border-radius:10px;padding:12px}.summary span{display:block;color:#6f7285;font-size:12px}.summary strong{display:block;margin-top:6px;font-size:18px}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f8f7ff;color:#312e81}@media print{body{margin:16px}.summary{grid-template-columns:repeat(2,1fr)}}`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function siteName(siteId) {
  return escapeHtml(findSite(siteId).name || "Unknown site");
}

function plainSiteName(siteId) {
  return findSite(siteId).name || "Unknown site";
}

function findSite(siteId) {
  return state.sites.find((site) => site.id === siteId) || {};
}

function siteExtraTotal(siteId) {
  return sum(state.extraWorks.filter((item) => item.siteId === siteId), "amount");
}

function siteTotalAmount(siteId) {
  const site = findSite(siteId);
  return number(site.contract) + siteExtraTotal(siteId);
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + number(row[key]), 0);
}

function uniqueCount(rows, key) {
  return new Set(rows.map((row) => String(row[key] || "").trim()).filter(Boolean)).size;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function filesToDataUrls(files) {
  return Promise.all(files.map(fileToDataUrl));
}

function initials(value) {
  return String(value || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function number(value) {
  return Number(value) || 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function byDateDesc(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function byTargetDateAsc(a, b) {
  return String(a.targetDate || a.date || "").localeCompare(String(b.targetDate || b.date || ""));
}

function formatMoney(value) {
  return moneyFormatter.format(number(value));
}

function dateText(value) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function longDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty">No records yet.</td></tr>`;
}

function emptyCard(text) {
  return `<div class="activity-card"><p>${escapeHtml(text)}</p></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
