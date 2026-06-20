const STORAGE_KEY = "site-ledger-data-v1";
const SESSION_KEY = "site-tracker-session-v1";
const REMEMBERED_LOGIN_KEY = "hh-spaces-remembered-login-v1";
const THEME_KEY = "hh-spaces-theme-v1";
const SUPABASE_CONFIG_KEY = "hh-spaces-supabase-config-v1";
const AI_CHAT_KEY = "hh-spaces-ai-chat-v1";
const OPENAI_KEY = "hh-spaces-openai-key-v1";
const CLOUD_TABLE = "hh_spaces_app_state";
const CLOUD_ROW_ID = "main";
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
let supabaseClient = null;
let cloudSaveTimer = null;
let currentPrintableHtml = "";
let currentPrintableTitle = "H&H SPACES Report";
let pendingAiEntry = null;
let speechRecognizer = null;

const views = {
  dashboard: "Dashboard",
  capital: "Company Capital",
  sites: "Sites & Clients",
  rateList: "Rate List",
  customerBills: "Customer Bills",
  extraWorks: "Extra Site Works",
  wages: "Labour Wages",
  materials: "Material Expenses",
  expenses: "Expense Tracker",
  payments: "Client Payments",
  bills: "Pending Payment Bills",
  measurements: "Measurement Book",
  boq: "BOQ Management",
  schedule: "Schedule & Targets",
  progress: "Work Progress",
  diary: "Site Diary",
  tools: "Tools",
  settings: "Settings",
  updates: "Daily Updates"
};

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  applySettingsPreferences();
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    input.value = today;
  });
  document.getElementById("monthFilter").value = currentMonth;
  document.getElementById("todayLabel").textContent = longDate(today);

  bindAuth();
  bindNavigation();
  bindSearch();
  bindForms();
  bindToolCalculators();
  bindAiAssistant();
  setupSettingsAccordions();
  bindActions();
  bindCloudSync();
  initSupabaseClient();
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
    localStorage.setItem(REMEMBERED_LOGIN_KEY, user.username);
    clearAuthForm();
    updateAuthView();
    return;
  }

  showAuthMessage("Wrong username or password.");
}

function updateAuthView() {
  const rememberedUser = localStorage.getItem(REMEMBERED_LOGIN_KEY);
  const sessionUser = sessionStorage.getItem(SESSION_KEY);
  const unlocked = Boolean(sessionUser || rememberedUser);
  if (!sessionUser && rememberedUser) {
    sessionStorage.setItem(SESSION_KEY, rememberedUser);
  }
  document.body.classList.toggle("app-locked", !unlocked);
  document.getElementById("authModeText").textContent = "Login once on this device";
  document.getElementById("authSubmit").textContent = "Login";
  document.getElementById("confirmPassWrap")?.classList.add("is-hidden");
  document.getElementById("authPass").setAttribute("autocomplete", "current-password");
}

function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBERED_LOGIN_KEY);
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

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    return normalizeState(JSON.parse(saved));
  }

  return normalizeState({
    capital: [],
    sites: [],
    rateList: [],
    customerBills: [],
    extraWorks: [],
    wages: [],
    materials: [],
    expenses: [],
    payments: [],
    bills: [],
    measurements: [],
    boq: [],
    schedule: [],
    progress: [],
    diary: [],
    tools: {
      wageCalendar: [],
      measurements: [],
      equipment: [],
      quotations: []
    },
    settings: {},
    updates: []
  });
}

function normalizeState(data) {
  return {
    capital: Array.isArray(data.capital) ? data.capital : [],
    sites: Array.isArray(data.sites) ? data.sites : [],
    rateList: Array.isArray(data.rateList) ? data.rateList : [],
    customerBills: Array.isArray(data.customerBills) ? data.customerBills : [],
    extraWorks: Array.isArray(data.extraWorks) ? data.extraWorks : [],
    wages: Array.isArray(data.wages) ? data.wages : [],
    materials: Array.isArray(data.materials) ? data.materials : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    payments: Array.isArray(data.payments) ? data.payments : [],
    bills: Array.isArray(data.bills) ? data.bills : [],
    measurements: Array.isArray(data.measurements) ? data.measurements : [],
    boq: Array.isArray(data.boq) ? data.boq : [],
    schedule: Array.isArray(data.schedule) ? data.schedule : [],
    progress: Array.isArray(data.progress) ? data.progress : [],
    diary: Array.isArray(data.diary) ? data.diary : [],
    tools: normalizeTools(data.tools),
    settings: typeof data.settings === "object" && data.settings ? data.settings : {},
    updates: Array.isArray(data.updates) ? data.updates : []
  };
}

function normalizeTools(tools) {
  return {
    wageCalendar: Array.isArray(tools?.wageCalendar) ? tools.wageCalendar : [],
    measurements: Array.isArray(tools?.measurements) ? tools.measurements : [],
    equipment: Array.isArray(tools?.equipment) ? tools.equipment : [],
    quotations: Array.isArray(tools?.quotations) ? tools.quotations : []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
}

function bindCloudSync() {
  document.getElementById("cloudSync").addEventListener("click", openCloudModal);
  document.getElementById("closeCloud").addEventListener("click", closeCloudModal);
  document.getElementById("saveCloudConfig").addEventListener("click", saveCloudConfig);
  document.getElementById("pullCloud").addEventListener("click", pullCloudState);
  document.getElementById("pushCloud").addEventListener("click", () => pushCloudState(true));
}

function openCloudModal() {
  const config = getSupabaseConfig();
  document.getElementById("supabaseUrl").value = config.url || "";
  document.getElementById("supabaseAnonKey").value = config.anonKey || "";
  document.getElementById("cloudModal").classList.remove("is-hidden");
  updateCloudStatus(supabaseClient ? "Connected. You can load or save cloud data." : "Not connected. Paste Supabase details.");
}

function closeCloudModal() {
  document.getElementById("cloudModal").classList.add("is-hidden");
}

function getSupabaseConfig() {
  const saved = localStorage.getItem(SUPABASE_CONFIG_KEY);
  return saved ? JSON.parse(saved) : {};
}

function saveCloudConfig() {
  const url = document.getElementById("supabaseUrl").value.trim();
  const anonKey = document.getElementById("supabaseAnonKey").value.trim();
  if (!url || !anonKey) {
    updateCloudStatus("Enter Project URL and anon public key.");
    return;
  }
  localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, anonKey }));
  initSupabaseClient();
  updateCloudStatus(supabaseClient ? "Connected. Press Save To Cloud once." : "Could not connect. Check URL/key.");
}

function initSupabaseClient() {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !window.supabase?.createClient) {
    supabaseClient = null;
    return;
  }
  supabaseClient = window.supabase.createClient(config.url, config.anonKey);
}

function queueCloudSave() {
  if (!supabaseClient || (!sessionStorage.getItem(SESSION_KEY) && !localStorage.getItem(REMEMBERED_LOGIN_KEY))) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => pushCloudState(false), 1200);
}

async function pushCloudState(showResult) {
  if (!supabaseClient) {
    if (showResult) updateCloudStatus("Not connected. Save Supabase URL and anon key first.");
    return;
  }
  const payload = JSON.parse(JSON.stringify(state));
  const { error } = await supabaseClient
    .from(CLOUD_TABLE)
    .upsert({ id: CLOUD_ROW_ID, payload, updated_at: new Date().toISOString() });

  if (error) {
    updateCloudStatus(`Cloud save failed: ${error.message}`);
    return;
  }
  updateCloudStatus(`Saved to cloud at ${new Date().toLocaleTimeString("en-IN")}.`);
}

async function pullCloudState() {
  if (!supabaseClient) {
    updateCloudStatus("Not connected. Save Supabase URL and anon key first.");
    return;
  }
  const { data, error } = await supabaseClient
    .from(CLOUD_TABLE)
    .select("payload, updated_at")
    .eq("id", CLOUD_ROW_ID)
    .maybeSingle();

  if (error) {
    updateCloudStatus(`Cloud load failed: ${error.message}`);
    return;
  }
  if (!data?.payload) {
    updateCloudStatus("No cloud data found. Press Save To Cloud first.");
    return;
  }

  Object.assign(state, normalizeState(data.payload));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  updateCloudStatus(`Loaded cloud data from ${data.updated_at ? new Date(data.updated_at).toLocaleString("en-IN") : "Supabase"}.`);
}

function updateCloudStatus(message) {
  const status = document.getElementById("cloudStatus");
  if (status) status.textContent = message;
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

function bindSearch() {
  document.getElementById("globalSearch").addEventListener("input", renderSearchResults);
  document.getElementById("clearSearch").addEventListener("click", () => {
    document.getElementById("globalSearch").value = "";
    renderSearchResults();
  });

  document.getElementById("searchResultsList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-search-view]");
    if (!button) return;
    activateView(button.dataset.searchView);
  });
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

  bindForm("rateListForm", (data) => {
    state.rateList.push({
      id: makeId(),
      date: data.date,
      category: data.category,
      work: data.work,
      unit: data.unit,
      rate: number(data.rate),
      note: data.note
    });
  });

  bindForm("customerBillForm", (data) => {
    const site = findSite(data.siteId);
    const quantity = number(data.quantity || 1);
    const rate = number(data.rate);
    const amount = quantity * rate;
    const discount = number(data.discount);
    const tax = number(data.tax);
    const total = Math.max(amount - discount + tax, 0);
    state.customerBills.push({
      id: makeId(),
      date: data.date,
      billNo: data.billNo,
      siteId: data.siteId,
      client: data.client || site.client || "",
      clientAddress: data.clientAddress,
      clientPan: data.clientPan,
      clientGst: data.clientGst,
      clientEmail: data.clientEmail,
      work: data.work,
      unit: data.unit,
      quantity,
      rate,
      amount,
      discount,
      tax,
      total,
      status: data.status,
      note: data.note
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
      category: data.category,
      unit: data.unit,
      quantityReceived: number(data.quantityReceived),
      quantityUsed: number(data.quantityUsed),
      supplier: data.supplier,
      billNo: data.billNo,
      amount: number(data.amount)
    });
  });

  bindForm("expenseForm", (data) => {
    state.expenses.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      type: data.type,
      title: data.title,
      paidTo: data.paidTo,
      amount: number(data.amount),
      notes: data.notes
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

  bindForm("measurementForm", (data) => {
    const plaster = number(data.plasterSqft);
    const pop = number(data.popSqft);
    const tile = number(data.tileSqft);
    const waterproofing = number(data.waterproofingSqft);
    const painting = number(data.paintingSqft);
    const electrical = number(data.electricalPoints);
    const runningFeet = number(data.runningFeet);
    state.measurements.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      area: data.area,
      plasterSqft: plaster,
      popSqft: pop,
      tileSqft: tile,
      waterproofingSqft: waterproofing,
      paintingSqft: painting,
      electricalPoints: electrical,
      runningFeet,
      total: plaster + pop + tile + waterproofing + painting + electrical + runningFeet,
      notes: data.notes
    });
  });

  bindForm("boqForm", (data) => {
    const estimatedCost = number(data.estimatedCost);
    const actualCost = number(data.actualCost);
    state.boq.push({
      id: makeId(),
      siteId: data.siteId,
      item: data.item,
      unit: data.unit,
      estimatedQuantity: number(data.estimatedQuantity),
      estimatedCost,
      actualQuantity: number(data.actualQuantity),
      actualCost,
      variance: actualCost - estimatedCost,
      notes: data.notes
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

  bindForm("diaryForm", (data) => {
    state.diary.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      weather: data.weather,
      dailyNotes: data.dailyNotes,
      labourIssues: data.labourIssues,
      materialIssues: data.materialIssues,
      clientInstructions: data.clientInstructions
    });
  });

  bindForm("settingsForm", async (data, form) => {
    const logoFile = form.elements.logo?.files?.[0];
    const signatureFile = form.elements.signature?.files?.[0];
    const nextSettings = { ...(state.settings || {}) };
    Array.from(form.elements).forEach((element) => {
      if (!element.name || element.type === "file" || element.type === "submit") return;
      nextSettings[element.name] = element.value;
    });
    nextSettings.logo = logoFile ? await fileToDataUrl(logoFile) : state.settings.logo || "";
    nextSettings.signature = signatureFile ? await fileToDataUrl(signatureFile) : state.settings.signature || "";
    if (data.openAiApiKey) localStorage.setItem(OPENAI_KEY, data.openAiApiKey);
    delete nextSettings.openAiApiKey;
    state.settings = nextSettings;
    applySettingsPreferences();
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

  bindForm("wageCalendarForm", (data) => {
    const summary = wageCalendarSummary(data.attendance, number(data.dailyWage));
    state.tools.wageCalendar.push({
      id: makeId(),
      month: data.month,
      siteId: data.siteId,
      name: data.name,
      dailyWage: number(data.dailyWage),
      attendance: data.attendance,
      ...summary
    });
  });

  bindForm("siteMeasurementToolForm", async (data, form) => {
    const photoFile = form.elements.photo?.files?.[0];
    const length = number(data.length);
    const width = number(data.width);
    const height = number(data.height);
    state.tools.measurements.push({
      id: makeId(),
      date: data.date,
      siteId: data.siteId,
      area: data.area,
      length,
      width,
      height,
      sqft: length && width ? length * width : 0,
      cft: length && width && height ? length * width * height : 0,
      notes: data.notes,
      photo: photoFile ? await fileToDataUrl(photoFile) : ""
    });
  });

  bindForm("equipmentForm", (data) => {
    state.tools.equipment.push({
      id: makeId(),
      toolName: data.toolName,
      quantity: number(data.quantity),
      purchaseDate: data.purchaseDate,
      cost: number(data.cost),
      assignedTo: data.assignedTo,
      siteId: data.siteId,
      status: data.status
    });
  });

  bindForm("quotationForm", (data) => {
    const area = number(data.area);
    const labourRate = number(data.labourRate);
    const materialRate = number(data.materialRate);
    const profitPercent = number(data.profitPercent);
    const gstPercent = number(data.gstPercent);
    const baseCost = area * (labourRate + materialRate);
    const profit = baseCost * (profitPercent / 100);
    const beforeGst = baseCost + profit;
    const gst = beforeGst * (gstPercent / 100);
    state.tools.quotations.push({
      id: makeId(),
      date: data.date,
      quoteNo: data.quoteNo,
      client: data.client,
      workType: data.workType,
      area,
      unit: data.unit,
      labourRate,
      materialRate,
      profitPercent,
      gstPercent,
      baseCost,
      profit,
      gst,
      total: beforeGst + gst,
      terms: data.terms
    });
  });
}

function bindForm(formId, onSubmit) {
  const form = document.getElementById(formId);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const siteOptionalForms = ["siteForm", "capitalForm", "rateListForm", "settingsForm", "wageCalendarForm", "siteMeasurementToolForm", "equipmentForm", "quotationForm"];
    if (!state.sites.length && !siteOptionalForms.includes(formId)) {
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

function bindToolCalculators() {
  document.querySelectorAll("[data-calculator] input, [data-calculator] select").forEach((input) => {
    input.addEventListener("input", renderToolCalculators);
    input.addEventListener("change", renderToolCalculators);
  });
  renderToolCalculators();
}

function setupSettingsAccordions() {
  const form = document.getElementById("settingsForm");
  if (!form || form.dataset.compactReady) return;
  form.dataset.compactReady = "1";
  const sections = Array.from(form.querySelectorAll(".settings-section"));
  sections.forEach((section, index) => {
    const title = section.querySelector("h4")?.textContent || "Settings";
    const group = document.createElement("section");
    group.className = `settings-group full-row${index === 0 ? " is-open" : ""}`;
    const header = document.createElement("button");
    header.type = "button";
    header.className = "settings-group__header";
    header.innerHTML = `<span>${escapeHtml(title)}</span><b>${index === 0 ? "Close" : "Open"}</b>`;
    const body = document.createElement("div");
    body.className = "settings-group__body";
    section.replaceWith(group);
    group.append(header, body);
    let next = group.nextElementSibling;
    while (next && !next.classList.contains("settings-section")) {
      const current = next;
      next = next.nextElementSibling;
      body.appendChild(current);
    }
    header.addEventListener("click", () => {
      const open = group.classList.toggle("is-open");
      header.querySelector("b").textContent = open ? "Close" : "Open";
    });
  });
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.classList.add("settings-save-btn", "full-row");
    form.appendChild(submit);
  }
}


function bindAiAssistant() {
  document.getElementById("openAiAssistant")?.addEventListener("click", openAiAssistant);
  document.getElementById("closeAiAssistant")?.addEventListener("click", closeAiAssistant);
  document.getElementById("aiForm")?.addEventListener("submit", handleAiSubmit);
  document.getElementById("aiVoiceInput")?.addEventListener("click", startAiVoiceInput);
  document.getElementById("aiSpeakLast")?.addEventListener("click", speakLastAiAnswer);
  document.querySelectorAll("[data-ai-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("aiInput").value = button.dataset.aiPrompt;
      submitAiPrompt(button.dataset.aiPrompt);
    });
  });
  document.getElementById("aiPreview")?.addEventListener("click", handleAiPreviewAction);
  renderAiChat();
}

function openAiAssistant() {
  document.getElementById("aiDrawer").classList.remove("is-hidden");
  renderAiChat();
  setTimeout(() => document.getElementById("aiInput")?.focus(), 80);
}

function closeAiAssistant() {
  document.getElementById("aiDrawer").classList.add("is-hidden");
}

function handleAiSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("aiInput");
  const prompt = input.value.trim();
  if (!prompt) return;
  input.value = "";
  submitAiPrompt(prompt);
}

async function submitAiPrompt(prompt) {
  addAiMessage("user", prompt);
  renderAiTyping();
  const response = await generateAiResponse(prompt);
  removeAiTyping();
  addAiMessage("assistant", response.message);
  if (response.preview) showAiPreview(response.preview);
  else clearAiPreview();
}

function addAiMessage(role, text) {
  const history = getAiHistory();
  history.push({ role, text, time: new Date().toISOString() });
  localStorage.setItem(AI_CHAT_KEY, JSON.stringify(history.slice(-80)));
  renderAiChat();
}

function getAiHistory() {
  try {
    return JSON.parse(localStorage.getItem(AI_CHAT_KEY) || "[]");
  } catch {
    return [];
  }
}

function renderAiChat() {
  const chat = document.getElementById("aiChat");
  if (!chat) return;
  const history = getAiHistory();
  chat.innerHTML = history.length
    ? history.map((item) => `<article class="ai-message ${item.role}"><p>${escapeHtml(item.text)}</p></article>`).join("")
    : `<article class="ai-message assistant"><p>Ask me about pending payment, profit, labour, low stock, reports, quotations, or construction calculations.</p></article>`;
  chat.scrollTop = chat.scrollHeight;
}

function renderAiTyping() {
  const chat = document.getElementById("aiChat");
  if (!chat) return;
  chat.insertAdjacentHTML("beforeend", `<article class="ai-message assistant typing" id="aiTyping"><p>Thinking<span>.</span><span>.</span><span>.</span></p></article>`);
  chat.scrollTop = chat.scrollHeight;
}

function removeAiTyping() {
  document.getElementById("aiTyping")?.remove();
}

async function generateAiResponse(prompt) {
  const lower = prompt.toLowerCase();
  const local = localAiResponse(prompt, lower);
  const openAiKey = localStorage.getItem(OPENAI_KEY);
  if (!openAiKey || local.confident) return local;

  try {
    const remote = await askOpenAi(prompt, local.message, openAiKey);
    return { message: remote || local.message };
  } catch {
    return local;
  }
}

async function askOpenAi(prompt, fallback, key) {
  const payload = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a concise construction site management assistant. Use the provided app summary. Do not invent missing records." },
      { role: "user", content: `${aiDataSummary()}\n\nQuestion: ${prompt}` }
    ]
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return fallback;
  const data = await response.json();
  return data.choices?.[0]?.message?.content || fallback;
}

function localAiResponse(prompt, lower) {
  const smartEntry = detectSmartEntry(prompt, lower);
  if (smartEntry) return smartEntry;
  if (lower.includes("focus") || lower.includes("today")) return { confident: true, message: aiTodayFocus() };
  if (lower.includes("pending") || lower.includes("receivable") || lower.includes("balance due")) return { confident: true, message: aiPendingPayments() };
  if (lower.includes("profit")) return { confident: true, message: aiProfitSummary(lower.includes("month")) };
  if (lower.includes("expense")) return { confident: true, message: aiTodayExpenses() };
  if (lower.includes("labour") || lower.includes("labor") || lower.includes("present")) return { confident: true, message: aiLabourSummary() };
  if (lower.includes("low stock") || lower.includes("stock low") || lower.includes("material stock")) return { confident: true, message: aiLowStock() };
  if (lower.includes("delayed")) return { confident: true, message: aiDelayedProjects() };
  if (lower.includes("highest profit")) return { confident: true, message: aiHighestProfitSite() };
  if (lower.includes("report")) return { confident: true, message: aiReportAction(lower) };
  if (lower.includes("quote") || lower.includes("quotation")) return { confident: true, message: "Open Tools > Quotation Generator. Enter work type, area, labour rate, material rate, profit %, and GST %. I can also create a quotation preview if you type: quotation POP 1000 sqft labour 6 material 10." };
  const construction = aiConstructionCalc(prompt, lower);
  if (construction) return { confident: true, message: construction };
  return { confident: false, message: `I can help with payments, profit, today's expenses, labour, low stock, delayed projects, reports, quotations and calculators. Try: "How much payment is pending?" or "Calculate plaster for wall 20x10 ft."` };
}


function renderToolCalculators() {
  const v = (key) => number(document.querySelector(`[data-calc="${key}"]`)?.value);
  const text = (key) => document.querySelector(`[data-calc="${key}"]`)?.value || "";
  const set = (id, value) => {
    const output = document.getElementById(id);
    if (output) output.innerHTML = value;
  };

  const wallLength = v("wallLength");
  const wallHeight = v("wallHeight");
  const wallThickness = v("wallThickness");
  const brickVolume = wallLength * wallHeight * (wallThickness / 12);
  const brickQty = Math.ceil(brickVolume * 13.5);
  set("brickResult", brickVolume ? `Bricks: <b>${brickQty}</b><br>Cement: <b>${round(brickQty / 500, 2)} bags</b><br>Sand: <b>${round(brickVolume * 0.35, 2)} cft</b>` : "Enter wall size.");

  const plasterArea = v("plasterArea");
  const plasterThickness = v("plasterThickness");
  const plasterVolume = plasterArea * (plasterThickness / 304.8);
  set("plasterResult", plasterArea ? `Cement: <b>${round(plasterVolume * 0.18, 2)} bags</b><br>Sand: <b>${round(plasterVolume * 1.2, 2)} cft</b>` : "Enter plaster area.");

  const popArea = v("popArea");
  set("popResult", popArea ? `POP bags: <b>${Math.ceil(popArea / 45)}</b><br>Labour: <b>${formatMoney(popArea * v("popLabour"))}</b><br>Material: <b>${formatMoney(popArea * v("popMaterial"))}</b>` : "Enter POP area and rates.");

  const tileArea = v("tileArea");
  const tileSize = v("tileSize") || 1;
  const tileAreaWithWaste = tileArea * (1 + v("tileWastage") / 100);
  set("tileResult", tileArea ? `Tiles: <b>${Math.ceil(tileAreaWithWaste / tileSize)}</b><br>Boxes: <b>${Math.ceil(tileAreaWithWaste / (tileSize * 4))}</b><br>Area with wastage: <b>${round(tileAreaWithWaste, 2)} sqft</b>` : "Enter tile area.");

  const paintArea = v("paintArea");
  set("paintResult", paintArea ? `Primer: <b>${round(paintArea / 100, 2)} L</b><br>Putty: <b>${round(paintArea / 18, 2)} kg</b><br>Paint: <b>${round((paintArea * 2) / 120, 2)} L</b>` : "Enter wall area.");

  const rccArea = v("rccArea");
  const rccVolume = rccArea * (v("rccThickness") / 12);
  set("rccResult", rccArea ? `Concrete: <b>${round(rccVolume, 2)} cft</b><br>Cement: <b>${round(rccVolume / 5.5, 2)} bags</b><br>Sand: <b>${round(rccVolume * 0.42, 2)} cft</b><br>Aggregate: <b>${round(rccVolume * 0.84, 2)} cft</b>` : "Enter slab details.");

  const waterproofArea = v("waterproofArea");
  const waterproofVolume = waterproofArea * (v("waterproofThickness") / 12);
  set("waterproofResult", waterproofArea ? `Brick bat: <b>${Math.ceil(waterproofVolume * 13.5)} bricks</b><br>Cement: <b>${round(waterproofArea / 90, 2)} bags</b><br>Chemical: <b>${round(waterproofArea / 100, 2)} L</b><br>Slope: <b>${round(v("waterproofSlope"), 2)}%</b>` : "Enter terrace area.");

  const pointTotal = v("lightPoints") + v("fanPoints") + v("powerPoints");
  set("pointsResult", pointTotal ? `Total points: <b>${pointTotal}</b><br>Quotation: <b>${formatMoney(pointTotal * v("pointRate"))}</b>` : "Enter electrical points.");

  const wireLength = (v("houseArea") * 1.8) + (v("wirePoints") * 18);
  set("wireResult", wireLength ? `Approx wire length: <b>${Math.ceil(wireLength)} meter</b>` : "Enter house area and points.");

  const loadKw = v("connectedLoad") / 1000;
  const mcb = loadKw <= 2 ? "16A" : loadKw <= 4 ? "25A" : loadKw <= 7 ? "32A" : "63A";
  const cable = loadKw <= 2 ? "2.5 sqmm" : loadKw <= 4 ? "4 sqmm" : loadKw <= 7 ? "6 sqmm" : "10 sqmm";
  set("loadResult", loadKw ? `Load: <b>${round(loadKw, 2)} kW</b><br>Recommended MCB: <b>${mcb}</b><br>Cable size: <b>${cable}</b>` : "Enter connected load.");

  const analysisQty = v("analysisQty") || 1;
  const analysisCost = (v("analysisLabour") + v("analysisMaterial")) * analysisQty;
  const quotationRate = analysisQty ? (analysisCost * (1 + v("analysisProfit") / 100)) / analysisQty : 0;
  set("rateAnalysisResult", analysisCost ? `Cost/unit: <b>${formatMoney(analysisCost / analysisQty)}</b><br>Profit margin: <b>${round(v("analysisProfit"), 2)}%</b><br>Quotation rate: <b>${formatMoney(quotationRate)}</b>` : "Enter rates.");

  const profitQty = v("profitQty");
  const totalCost = profitQty * (v("profitLabour") + v("profitMaterial"));
  const totalRevenue = profitQty * v("profitQuoted");
  set("profitResult", profitQty ? `Total cost: <b>${formatMoney(totalCost)}</b><br>Total revenue: <b>${formatMoney(totalRevenue)}</b><br>Net profit: <b>${formatMoney(totalRevenue - totalCost)}</b>` : "Enter work quantity and rates.");

  const transportCost = (v("transportDistance") * v("vehicleRate")) + v("unloadingCharges");
  set("transportResult", transportCost ? `Material: <b>${escapeHtml(text("transportMaterial") || "-")}</b><br>Transport cost: <b>${formatMoney(transportCost)}</b><br>Labour required: <b>${v("transportLabour")}</b>` : "Enter transport details.");
}

function aiDataSummary() {
  const report = buildReportData();
  return JSON.stringify({
    date: today,
    summary: report.summary,
    sites: report.sites.slice(0, 20),
    materials: report.materials.slice(-30),
    expenses: report.expenses.slice(-30),
    payments: report.payments.slice(-30),
    quotations: report.quotations.slice(-20)
  });
}

function aiPendingPayments() {
  const totalBilled = sum(state.customerBills, "total") + sum(state.extraWorks, "amount");
  const received = sum(state.payments, "amount");
  const pending = Math.max(totalBilled - received, 0);
  return `Pending client payment is ${formatMoney(pending)}. Total billed is ${formatMoney(totalBilled)} and received payment is ${formatMoney(received)}.`;
}

function aiProfitSummary(monthOnly) {
  const wages = monthOnly ? filtered(state.wages) : state.wages;
  const materials = monthOnly ? filtered(state.materials) : state.materials;
  const expenses = monthOnly ? filtered(state.expenses) : state.expenses;
  const payments = monthOnly ? filtered(state.payments) : state.payments;
  const cost = sum(wages, "amount") + sum(materials, "amount") + sum(expenses, "amount");
  const revenue = sum(payments, "amount");
  const profit = revenue - cost;
  return `${monthOnly ? "This month" : "Overall"} revenue is ${formatMoney(revenue)}, cost is ${formatMoney(cost)}, and profit/loss is ${formatMoney(profit)}.`;
}

function aiTodayExpenses() {
  const rows = [...state.wages, ...state.materials, ...state.expenses].filter((item) => item.date === today);
  const total = sum(rows, "amount");
  return rows.length
    ? `Today's expenses are ${formatMoney(total)} from ${rows.length} entries.`
    : "No expenses are recorded for today yet.";
}

function aiLabourSummary() {
  const todayRows = state.wages.filter((item) => item.date === today);
  const present = todayRows.filter((item) => item.attendance !== "Absent").length;
  const cost = sum(todayRows, "amount");
  return `Today ${present} labour entries are present/working. Today's labour cost is ${formatMoney(cost)}.`;
}

function aiLowStock() {
  const lowLimit = number(state.settings.lowStockAlertQuantity || 10);
  const low = state.materials.filter((item) => (number(item.quantityReceived) - number(item.quantityUsed)) <= lowLimit);
  return low.length
    ? `Low stock materials: ${low.slice(0, 8).map((item) => `${item.item} (${number(item.quantityReceived) - number(item.quantityUsed)} ${item.unit || ""})`).join(", ")}.`
    : `No low stock material found under ${lowLimit} units.`;
}

function aiDelayedProjects() {
  const delayed = state.schedule.filter((item) => item.status === "Delayed");
  return delayed.length
    ? `Delayed projects/tasks: ${delayed.slice(0, 8).map((item) => `${plainSiteName(item.siteId)} - ${item.task}`).join(", ")}.`
    : "No delayed tasks are currently marked.";
}

function aiHighestProfitSite() {
  const rows = state.sites.map((site) => {
    const revenue = sum(state.payments.filter((item) => item.siteId === site.id), "amount");
    const cost = sum(state.wages.filter((item) => item.siteId === site.id), "amount") + sum(state.materials.filter((item) => item.siteId === site.id), "amount") + sum(state.expenses.filter((item) => item.siteId === site.id), "amount");
    return { site, profit: revenue - cost };
  }).sort((a, b) => b.profit - a.profit);
  return rows[0] ? `${rows[0].site.name} has the highest current profit: ${formatMoney(rows[0].profit)}.` : "Add sites and payments first to calculate highest profit.";
}

function aiTodayFocus() {
  const actions = [];
  const pending = sum(state.customerBills, "total") + sum(state.extraWorks, "amount") - sum(state.payments, "amount");
  if (pending > 0) actions.push(`Collect pending payment: ${formatMoney(pending)}.`);
  const lowStock = aiLowStock();
  if (!lowStock.startsWith("No low")) actions.push(lowStock);
  const delayed = state.schedule.filter((item) => item.status === "Delayed");
  if (delayed.length) actions.push(`Review delayed work: ${delayed[0].task} at ${plainSiteName(delayed[0].siteId)}.`);
  if (!state.wages.some((item) => item.date === today)) actions.push("Add today's labour attendance.");
  return actions.length ? `Focus today:\n${actions.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "Today looks clear. Add daily update and review site photos.";
}

function aiReportAction(lower) {
  if (lower.includes("daily")) return "Tap PDF Report for a full report, or use Daily Updates for site-wise daily notes and photos.";
  if (lower.includes("labour")) return aiLabourSummary();
  if (lower.includes("material")) return aiLowStock();
  if (lower.includes("profit")) return aiProfitSummary(lower.includes("month"));
  return "Reports available: Daily, Weekly, Monthly, Labour, Material, Expense, Client Billing and Profit. Tap PDF Report, Word Report, or Excel Report from the sidebar.";
}

function aiConstructionCalc(prompt, lower) {
  const nums = (prompt.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (lower.includes("plaster") && nums.length >= 2) {
    const area = nums[0] * nums[1];
    const volume = area * (12 / 304.8);
    return `Plaster area is ${round(area, 2)} sqft. Approx cement: ${round(volume * 0.18, 2)} bags. Approx sand: ${round(volume * 1.2, 2)} cft.`;
  }
  if (lower.includes("tile") && nums.length >= 1) {
    const area = nums[0] * 1.1;
    return `For ${nums[0]} sqft tiles with 10% wastage: order about ${round(area, 2)} sqft. For 2x2 tiles, about ${Math.ceil(area / 4)} tiles or ${Math.ceil(area / 16)} boxes if 4 tiles/box.`;
  }
  if (lower.includes("rcc") && nums.length >= 1) {
    const area = nums[0];
    const thickness = nums[1] || 5;
    const volume = area * (thickness / 12);
    return `RCC for ${area} sqft at ${thickness} inch: concrete ${round(volume, 2)} cft, cement ${round(volume / 5.5, 2)} bags, sand ${round(volume * 0.42, 2)} cft, aggregate ${round(volume * 0.84, 2)} cft.`;
  }
  if (lower.includes("waterproof") && nums.length >= 1) {
    const area = nums[0];
    return `Waterproofing ${area} sqft: cement about ${round(area / 90, 2)} bags, chemical about ${round(area / 100, 2)} liters, brick bat approx ${Math.ceil(area * 3 / 12 * 13.5)} bricks for 3 inch layer.`;
  }
  if (lower.includes("wire") || lower.includes("3bhk")) {
    const area = nums[0] || 1200;
    return `Approx wire for ${area} sqft / 3BHK: ${Math.ceil(area * 1.8 + 45 * 18)} meters. Final wire depends on point layout and DB position.`;
  }
  return "";
}

function detectSmartEntry(prompt, lower) {
  const amount = extractAmount(prompt);
  const qty = extractFirstNumber(prompt);
  if (lower.includes("labour") && lower.includes("present")) {
    const count = qty || 1;
    return entryPreview("wages", `Add ${count} labour present today?`, {
      date: today,
      siteId: currentSiteIdForEntry(),
      worker: `${count} Labour`,
      phone: "",
      workType: "Site work",
      attendance: "Present",
      days: count,
      rate: number(state.settings.defaultHelperRate || 0),
      amount: count * number(state.settings.defaultHelperRate || 0)
    });
  }
  if ((lower.includes("bought") || lower.includes("purchase")) && (lower.includes("cement") || lower.includes("material"))) {
    return entryPreview("materials", `Add material purchase ${qty || 1} cement bags for ${formatMoney(amount)}?`, {
      id: makeId(),
      date: today,
      siteId: currentSiteIdForEntry(),
      item: lower.includes("cement") ? "Cement" : "Material",
      category: "Purchase",
      unit: "Bag",
      quantityReceived: qty || 1,
      quantityUsed: 0,
      supplier: "",
      billNo: "",
      amount
    });
  }
  if (lower.includes("client paid") || lower.includes("payment received")) {
    return entryPreview("payments", `Add client payment ${formatMoney(amount)}?`, {
      id: makeId(),
      date: today,
      siteId: currentSiteIdForEntry(),
      client: "",
      mode: "Cash",
      reference: "AI entry",
      amount
    });
  }
  if (lower.includes("completed") && (lower.includes("plaster") || lower.includes("sqft"))) {
    return entryPreview("measurements", `Add completed plaster measurement ${qty || 0} sqft?`, {
      id: makeId(),
      date: today,
      siteId: currentSiteIdForEntry(),
      area: "AI plaster entry",
      plasterSqft: qty || 0,
      popSqft: 0,
      tileSqft: 0,
      waterproofingSqft: 0,
      paintingSqft: 0,
      electricalPoints: 0,
      runningFeet: 0,
      total: qty || 0,
      notes: prompt
    });
  }
  return null;
}

function entryPreview(collection, message, item) {
  pendingAiEntry = { collection, item };
  return {
    confident: true,
    message,
    preview: { collection, item, message }
  };
}

function showAiPreview(preview) {
  const box = document.getElementById("aiPreview");
  box.classList.remove("is-hidden");
  box.innerHTML = `<strong>Preview Entry</strong><p>${escapeHtml(preview.message)}</p><pre>${escapeHtml(JSON.stringify(preview.item, null, 2))}</pre><div><button class="primary-btn" data-ai-save="1" type="button">Save Entry</button><button class="secondary-light-btn" data-ai-cancel="1" type="button">Cancel</button></div>`;
}

function clearAiPreview() {
  pendingAiEntry = null;
  const box = document.getElementById("aiPreview");
  if (box) {
    box.classList.add("is-hidden");
    box.innerHTML = "";
  }
}

function handleAiPreviewAction(event) {
  if (event.target.closest("[data-ai-cancel]")) {
    clearAiPreview();
    return;
  }
  if (!event.target.closest("[data-ai-save]") || !pendingAiEntry) return;
  const { collection, item } = pendingAiEntry;
  const savedItem = { id: item.id || makeId(), ...item };
  state[collection].push(savedItem);
  saveState();
  render();
  clearAiPreview();
  addAiMessage("assistant", "Entry saved successfully.");
}

function currentSiteIdForEntry() {
  const selected = document.getElementById("siteFilter")?.value;
  if (selected && selected !== "all") return selected;
  return state.sites[0]?.id || "";
}

function extractAmount(text) {
  const match = text.replace(/,/g, "").match(/₹\s*(\d+(\.\d+)?)|rs\.?\s*(\d+(\.\d+)?)|(\d+(\.\d+)?)(?=\s*(rupees|rs|₹))/i);
  return number(match?.[1] || match?.[3] || match?.[5] || 0);
}

function extractFirstNumber(text) {
  return number((text.match(/\d+(\.\d+)?/) || [0])[0]);
}

function startAiVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    addAiMessage("assistant", "Voice input is not supported in this browser. On iPhone, Safari support can vary.");
    return;
  }
  speechRecognizer = new SpeechRecognition();
  speechRecognizer.lang = "en-IN";
  speechRecognizer.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript || "";
    document.getElementById("aiInput").value = text;
  };
  speechRecognizer.start();
}

function speakLastAiAnswer() {
  const last = [...getAiHistory()].reverse().find((item) => item.role === "assistant");
  if (!last || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(last.text));
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

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-print-bill]");
    if (!button) return;
    openCustomerBillPreview(button.dataset.printBill);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-tool]");
    if (!button) return;
    const [collection, id] = button.dataset.deleteTool.split(":");
    state.tools[collection] = state.tools[collection].filter((item) => item.id !== id);
    saveState();
    render();
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-print-quote]");
    if (!button) return;
    openQuotationPreview(button.dataset.printQuote);
  });

  document.getElementById("resetDemo").addEventListener("click", () => {
    if (!confirm("Clear all saved data from this browser?")) return;
    Object.keys(state).forEach((key) => {
      if (key === "settings") state[key] = {};
      else if (key === "tools") state[key] = normalizeTools({});
      else state[key] = [];
    });
    saveState();
    render();
  });

  document.getElementById("oneClickBackup")?.addEventListener("click", () => exportDatabase("daily-backup"));
  document.getElementById("exportDatabase")?.addEventListener("click", () => exportDatabase("database"));
  document.getElementById("openSupabaseFromSettings")?.addEventListener("click", openCloudModal);
  document.getElementById("restoreDatabaseFile")?.addEventListener("change", restoreDatabase);

  document.getElementById("exportCsv").addEventListener("click", exportCsv);
  document.getElementById("exportWord").addEventListener("click", exportWordReport);
  document.getElementById("exportExcel").addEventListener("click", exportExcelReport);
  document.getElementById("exportPdf").addEventListener("click", exportPdfReport);
  document.getElementById("printReport").addEventListener("click", printReportPreview);
  document.getElementById("closeReport").addEventListener("click", closeReportPreview);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
}

function exportDatabase(type = "database") {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const payload = {
    app: "H&H SPACES",
    exportedAt: new Date().toISOString(),
    data: state
  };
  downloadFile(JSON.stringify(payload, null, 2), `hh-spaces-${type}-${dateStamp}.json`, "application/json");
}

function restoreDatabase(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const restored = normalizeState(parsed.data || parsed);
      Object.keys(restored).forEach((key) => {
        state[key] = restored[key];
      });
      saveState();
      render();
      alert("Database restored successfully.");
    } catch (error) {
      alert("Restore failed. Please choose a valid H&H SPACES JSON backup file.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function applyTheme() {
  const theme = localStorage.getItem(THEME_KEY) || "light";
  document.body.classList.toggle("dark-mode", theme === "dark");
  const button = document.getElementById("themeToggle");
  if (button) button.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
}

function applySettingsPreferences() {
  const settings = state.settings || {};
  if (settings.themeMode === "Light Mode") {
    localStorage.setItem(THEME_KEY, "light");
  } else if (settings.themeMode === "Dark Mode") {
    localStorage.setItem(THEME_KEY, "dark");
  } else if (settings.themeMode === "System Theme") {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    localStorage.setItem(THEME_KEY, prefersDark ? "dark" : "light");
  }

  if (settings.accentColor) {
    document.documentElement.style.setProperty("--primary", settings.accentColor);
  }

  applyTheme();
}

function toggleTheme() {
  const next = document.body.classList.contains("dark-mode") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme();
}

function render() {
  renderSiteFilter();
  renderSiteSelects();
  renderSearchResults();
  renderDashboard();
  renderCapital();
  renderSites();
  renderRateList();
  renderCustomerBills();
  renderExtraWorks();
  renderWages();
  renderMaterials();
  renderExpenses();
  renderPayments();
  renderBills();
  renderMeasurements();
  renderBoq();
  renderSchedule();
  renderProgress();
  renderDiary();
  renderTools();
  renderSettings();
  renderUpdates();
}

function renderSearchResults() {
  const input = document.getElementById("globalSearch");
  const query = input?.value.trim().toLowerCase() || "";
  const panel = document.getElementById("searchResultsPanel");
  const list = document.getElementById("searchResultsList");
  const title = document.getElementById("searchResultsTitle");
  if (!query) {
    panel.classList.add("is-hidden");
    list.innerHTML = "";
    return;
  }

  const results = buildSearchRecords()
    .filter((record) => searchMatches(record.searchText, query))
    .slice(0, 40);

  panel.classList.remove("is-hidden");
  title.textContent = `${results.length} result${results.length === 1 ? "" : "s"} for "${input.value.trim()}"`;
  list.innerHTML = results.length
    ? results.map(searchResultCard).join("")
    : `<div class="activity-card"><p>No matching records found.</p></div>`;
}

function searchMatches(searchText, query) {
  if (searchText.includes(query)) return true;
  const words = query.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((word) => searchText.includes(word));
}

function buildSearchRecords() {
  const records = [...buildModuleSearchRecords()];
  state.sites.forEach((site) => {
    records.push(makeSearchRecord("Sites & Clients", "sites", site.name, site.client, site, [
      ["Phone", site.phone],
      ["Location", site.location],
      ["Contract", formatMoney(site.contract)],
      ["Total", formatMoney(siteTotalAmount(site.id))]
    ]));
  });
  state.capital.forEach((item) => {
    records.push(makeSearchRecord("Company Capital", "capital", item.source, item.type, item, [
      ["Date", dateText(item.date)],
      ["Amount", formatMoney(item.amount)]
    ]));
  });
  state.rateList.forEach((item) => {
    records.push(makeSearchRecord("Rate List", "rateList", item.work, item.category, item, [
      ["Date", dateText(item.date)],
      ["Unit", item.unit],
      ["Rate", formatMoney(item.rate)],
      ["Note", item.note]
    ]));
  });
  state.customerBills.forEach((item) => {
    records.push(makeSearchRecord("Customer Bills", "customerBills", item.billNo || item.work, item.client || plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Site", plainSiteName(item.siteId)],
      ["Work", item.work],
      ["Quantity", `${item.quantity} ${item.unit || ""}`],
      ["Total", formatMoney(item.total)],
      ["Status", item.status]
    ]));
  });
  state.extraWorks.forEach((item) => {
    records.push(makeSearchRecord("Extra Works", "extraWorks", item.work, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Approved", item.approvedBy],
      ["Amount", formatMoney(item.amount)]
    ]));
  });
  state.wages.forEach((item) => {
    records.push(makeSearchRecord("Labour Wages", "wages", item.worker, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Mobile", item.phone],
      ["Work", item.workType],
      ["Attendance", item.attendance],
      ["Amount", formatMoney(item.amount)]
    ]));
  });
  state.materials.forEach((item) => {
    records.push(makeSearchRecord("Material Expenses", "materials", item.item, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Category", item.category],
      ["Stock", `${number(item.quantityReceived) - number(item.quantityUsed)} ${item.unit || ""}`],
      ["Supplier", item.supplier],
      ["Bill", item.billNo],
      ["Amount", formatMoney(item.amount)]
    ]));
  });
  state.expenses.forEach((item) => {
    records.push(makeSearchRecord("Expense Tracker", "expenses", item.title, item.type, item, [
      ["Date", dateText(item.date)],
      ["Site", plainSiteName(item.siteId)],
      ["Paid To", item.paidTo],
      ["Amount", formatMoney(item.amount)]
    ]));
  });
  state.payments.forEach((item) => {
    records.push(makeSearchRecord("Client Payments", "payments", item.client || plainSiteName(item.siteId), item.mode, item, [
      ["Date", dateText(item.date)],
      ["Site", plainSiteName(item.siteId)],
      ["Ref", item.reference],
      ["Amount", formatMoney(item.amount)]
    ]));
  });
  state.bills.forEach((item) => {
    records.push(makeSearchRecord("Pending Bills", "bills", item.party, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Due", item.dueDate ? dateText(item.dueDate) : ""],
      ["Detail", item.detail],
      ["Amount", formatMoney(item.amount)],
      ["Status", item.status]
    ]));
  });
  state.measurements.forEach((item) => {
    records.push(makeSearchRecord("Measurement Book", "measurements", item.area, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Total", item.total],
      ["Notes", item.notes]
    ]));
  });
  state.boq.forEach((item) => {
    records.push(makeSearchRecord("BOQ Management", "boq", item.item, plainSiteName(item.siteId), item, [
      ["Unit", item.unit],
      ["Estimated", formatMoney(item.estimatedCost)],
      ["Actual", formatMoney(item.actualCost)],
      ["Variance", formatMoney(item.variance)]
    ]));
  });
  state.schedule.forEach((item) => {
    records.push(makeSearchRecord("Schedule & Targets", "schedule", item.task, plainSiteName(item.siteId), item, [
      ["Target", dateText(item.targetDate)],
      ["Assigned", item.assignedTo],
      ["Status", item.status],
      ["Notes", item.notes]
    ]));
  });
  state.progress.forEach((item) => {
    records.push(makeSearchRecord("Work Progress", "progress", item.stage, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Progress", `${item.percent}%`],
      ["Notes", item.notes]
    ]));
  });
  state.diary.forEach((item) => {
    records.push(makeSearchRecord("Site Diary", "diary", item.dailyNotes, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Weather", item.weather],
      ["Client", item.clientInstructions]
    ]));
  });
  state.updates.forEach((item) => {
    records.push(makeSearchRecord("Daily Updates", "updates", plainSiteName(item.siteId), item.workDone, item, [
      ["Date", dateText(item.date)],
      ["Labour", item.labourCount],
      ["Weather", item.weather],
      ["Next", item.nextPlan],
      ["Photos", Array.isArray(item.photos) ? item.photos.length : 0]
    ]));
  });
  state.tools.wageCalendar.forEach((item) => {
    records.push(makeSearchRecord("Labour Wage Calendar", "tools", item.name, item.month, item, [
      ["Site", plainSiteName(item.siteId)],
      ["Total", formatMoney(item.totalWage)],
      ["Attendance", item.attendance]
    ]));
  });
  state.tools.equipment.forEach((item) => {
    records.push(makeSearchRecord("Equipment Tools", "tools", item.toolName, item.status, item, [
      ["Assigned", item.assignedTo],
      ["Site", plainSiteName(item.siteId)],
      ["Cost", formatMoney(item.cost)]
    ]));
  });
  state.tools.measurements.forEach((item) => {
    records.push(makeSearchRecord("Site Measurement Tool", "tools", item.area, plainSiteName(item.siteId), item, [
      ["Date", dateText(item.date)],
      ["Sqft", item.sqft],
      ["Notes", item.notes]
    ]));
  });
  state.tools.quotations.forEach((item) => {
    records.push(makeSearchRecord("Quotation Generator", "tools", item.quoteNo || item.workType, item.client, item, [
      ["Date", dateText(item.date)],
      ["Area", formatQuantity(item.area, item.unit)],
      ["Total", formatMoney(item.total)]
    ]));
  });
  return records;
}

function buildModuleSearchRecords() {
  return [
    moduleSearchRecord("Dashboard", "dashboard", "Dashboard", "Open summary, totals, progress charts and all modules", ["home", "main screen", "summary", "profit loss", "total expense"]),
    moduleSearchRecord("Company Capital", "capital", "Company Capital", "Add or check company capital, cash in hand and payment used", ["capital entry", "cash", "company money", "payment used"]),
    moduleSearchRecord("Sites & Clients", "sites", "Sites & Clients", "Create, edit and check construction sites and client details", ["site management", "client", "address", "contract value"]),
    moduleSearchRecord("Rate List", "rateList", "Rate List", "Save work rates and material rates for future billing", ["work rate", "remember rate", "price list", "labour rate"]),
    moduleSearchRecord("Customer Bills", "customerBills", "Make Customer Bill", "Create client bill, print bill and save as PDF", ["bill section", "billing", "invoice", "make bill", "customer bill", "print bill", "client bill"]),
    moduleSearchRecord("Extra Works", "extraWorks", "Extra Site Works", "Add approved extra work and increase site amount", ["extra work", "increase amount", "additional work"]),
    moduleSearchRecord("Labour Wages", "wages", "Labour Wages", "Daily labour attendance, wages, worker photo and payment records", ["labour wedges", "labour wages", "worker", "attendance", "daily wage", "payment"]),
    moduleSearchRecord("Material Expenses", "materials", "Material Expenses", "Material purchase, used stock, balance stock and suppliers", ["material", "stock", "cement", "sand", "supplier", "low stock"]),
    moduleSearchRecord("Expense Tracker", "expenses", "Expense Tracker", "Labour, material, transport, equipment and misc expenses", ["expense", "transport", "equipment expense", "misc"]),
    moduleSearchRecord("Client Payments", "payments", "Client Payments", "Add received payment and check client receivables", ["payment received", "client payment", "receivable"]),
    moduleSearchRecord("Pending Bills", "bills", "Pending Payment Bills", "Track unpaid supplier, labour, transport or site bills", ["pending payment", "unpaid bill", "supplier bill"]),
    moduleSearchRecord("Measurement Book", "measurements", "Measurement Book", "Save plaster, POP, tile, waterproofing, painting and RFT measurements", ["mb", "measurement", "plaster sqft", "pop sqft", "tile sqft", "rft"]),
    moduleSearchRecord("BOQ Management", "boq", "BOQ Management", "Estimated quantity, actual quantity, estimated cost and variance", ["boq", "estimate", "variance", "quantity"]),
    moduleSearchRecord("Schedule & Targets", "schedule", "Schedule & Targets", "Plan work schedule, targets, assigned person and status", ["target", "schedule", "work plan", "task"]),
    moduleSearchRecord("Work Progress", "progress", "Work Progress", "Daily progress percentage, stages and notes", ["progress", "percentage", "stage", "timeline"]),
    moduleSearchRecord("Site Diary", "diary", "Site Diary", "Daily notes, weather, labour issues, material issues and client instructions", ["diary", "daily notes", "weather", "site issue"]),
    moduleSearchRecord("Daily Updates", "updates", "Site Updates With Photos", "Daily update, photos, labour count, work done and tomorrow plan", ["site update", "photo", "photos", "history", "daily report"]),
    moduleSearchRecord("Settings", "settings", "Settings", "Company, GST, logo, bank, labour, billing, backup, theme and WhatsApp settings", ["company settings", "logo", "gst", "pan", "bank", "upi", "backup", "theme"]),
    moduleSearchRecord("Tools", "tools", "Brick Calculator", "Wall length, height, thickness, brick quantity, cement and sand estimate", ["brick", "brick calculator", "wall calculator", "cement sand"]),
    moduleSearchRecord("Tools", "tools", "Plaster Calculator", "Wall area, thickness, cement required and sand required", ["plaster", "plaster calculator", "cement required", "sand required"]),
    moduleSearchRecord("Tools", "tools", "POP Calculator", "Area, POP bags, labour cost and material cost", ["pop", "pop calculator", "false ceiling", "pop bags"]),
    moduleSearchRecord("Tools", "tools", "Tile Calculator", "Area, tile size, boxes required and wastage percentage", ["tile", "tiles", "tile calculator", "box", "wastage"]),
    moduleSearchRecord("Tools", "tools", "Paint Calculator", "Wall area, primer, putty and paint quantity", ["paint", "primer", "putty", "paint quantity"]),
    moduleSearchRecord("Tools", "tools", "RCC Calculator", "Slab area, thickness, concrete, cement, sand and aggregate", ["rcc", "slab", "concrete", "aggregate"]),
    moduleSearchRecord("Tools", "tools", "Electrical Point Calculator", "Light points, fan points, power points and auto quotation", ["electrical", "point calculator", "light point", "fan point", "power point"]),
    moduleSearchRecord("Tools", "tools", "Wire Calculator", "House area, number of points and approximate wire length", ["wire", "wire length", "house wiring"]),
    moduleSearchRecord("Tools", "tools", "Load Calculator", "Connected load, recommended MCB and cable size", ["load", "mcb", "cable size", "connected load"]),
    moduleSearchRecord("Tools", "tools", "Rate Analysis Tool", "Labour rate, material rate, quantity, cost per sqft and quotation rate", ["rate analysis", "cost sqft", "quotation rate", "profit margin"]),
    moduleSearchRecord("Tools", "tools", "Profit Calculator", "Calculate total cost, revenue and net profit for any work", ["profit", "net profit", "revenue", "quoted rate"]),
    moduleSearchRecord("Tools", "tools", "Waterproofing Calculator", "Terrace area, brick bat, slope, cement and waterproof chemical", ["waterproof", "waterproofing", "terrace", "brick bat", "chemical"]),
    moduleSearchRecord("Tools", "tools", "Material Transport Calculator", "Material type, distance, vehicle charge, labour and unloading charges", ["transport", "vehicle", "unloading", "fuel"]),
    moduleSearchRecord("Tools", "tools", "Labour Wage Calendar", "Monthly P, H, PP and A attendance with automatic wage calculation", ["wage calendar", "pp", "double wage", "half day", "absent"]),
    moduleSearchRecord("Tools", "tools", "Site Measurement Tool", "Take photo, store dimensions, notes and measurement record", ["measurement photo", "dimensions", "site measurement"]),
    moduleSearchRecord("Tools", "tools", "Equipment / Tools Management", "Track laser meter, drill, cutter, mixer, grinder, ladders and status", ["equipment", "tools management", "laser meter", "drill", "cutter", "mixer", "grinder", "ladder"]),
    moduleSearchRecord("Tools", "tools", "Quotation Generator", "Generate professional PDF quotation with GST and company logo", ["quotation", "quote", "pdf quotation", "gst quotation", "company logo"])
  ];
}

function moduleSearchRecord(section, view, title, subtitle, keywords = []) {
  return makeSearchRecord(section, view, title, subtitle, { type: "module", keywords: keywords.join(" ") }, [
    ["Shortcut", "Open section"],
    ["Use", subtitle]
  ]);
}

function makeSearchRecord(section, view, title, subtitle, item, details) {
  const safeDetails = details.filter(([, value]) => value !== undefined && value !== null && value !== "");
  const itemValues = Object.entries(item)
    .filter(([key, value]) => !["photo", "photos"].includes(key) && ["string", "number", "boolean"].includes(typeof value))
    .map(([, value]) => value);
  const haystack = [
    section,
    view,
    title,
    subtitle,
    ...itemValues,
    ...safeDetails.flatMap(([label, value]) => [label, value])
  ].join(" ").toLowerCase();
  return { section, view, title: title || section, subtitle: subtitle || "", details: safeDetails, searchText: haystack };
}

function searchResultCard(record) {
  const details = record.details
    .slice(0, 5)
    .map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`)
    .join("");
  return `<article class="search-card">
    <div>
      <span class="search-section">${escapeHtml(record.section)}</span>
      <h4>${escapeHtml(record.title)}</h4>
      <p>${escapeHtml(record.subtitle)}</p>
      <div class="search-detail-row">${details}</div>
    </div>
    <button class="secondary-light-btn" data-search-view="${record.view}" type="button">Open</button>
  </article>`;
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
  const expenses = filtered(state.expenses);
  const extraWorks = filtered(state.extraWorks);
  const customerBills = filtered(state.customerBills);
  const payments = filtered(state.payments);
  const bills = filtered(state.bills).filter((bill) => bill.status !== "Paid");
  const paidBills = filtered(state.bills).filter((bill) => bill.status === "Paid");
  const capitalAdded = sum(capital.filter((item) => item.type === "add"), "amount");
  const capitalWithdrawn = sum(capital.filter((item) => item.type === "withdraw"), "amount");
  const companyCapital = capitalAdded - capitalWithdrawn;
  const usedPayment = sum(wages, "amount") + sum(materials, "amount") + sum(expenses, "amount") + sum(paidBills, "amount");
  const totalContract = visibleSites().reduce((total, site) => total + siteTotalAmount(site.id), 0);
  const profitLoss = totalContract - usedPayment;
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
  document.getElementById("metricTotalSites").textContent = visibleSites().length;
  document.getElementById("metricProfitLoss").textContent = formatMoney(profitLoss);
  document.getElementById("metricCapital").textContent = formatMoney(companyCapital);
  document.getElementById("metricWages").textContent = formatMoney(sum(wages, "amount"));
  document.getElementById("metricMaterials").textContent = formatMoney(sum(materials, "amount"));
  document.getElementById("metricPayments").textContent = formatMoney(sum(payments, "amount"));
  document.getElementById("metricCustomerBills").textContent = formatMoney(sum(customerBills, "total"));
  document.getElementById("metricExtraWorks").textContent = formatMoney(sum(extraWorks, "amount"));
  document.getElementById("metricUsed").textContent = formatMoney(usedPayment);
  document.getElementById("metricExpenses").textContent = formatMoney(sum(expenses, "amount"));
  document.getElementById("metricBills").textContent = formatMoney(sum(bills, "amount"));
  document.getElementById("metricClientPending").textContent = formatMoney(clientPending);
  renderNotifications();
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

function renderNotifications() {
  const materialAlerts = state.materials
    .map((item) => {
      const received = number(item.quantityReceived);
      const used = number(item.quantityUsed);
      const balance = received - used;
      return { ...item, balance };
    })
    .filter((item) => number(item.quantityReceived) > 0 && item.balance <= Math.max(number(item.quantityReceived) * 0.15, 1))
    .map((item) => `<article class="activity-card"><h4>Low stock: ${escapeHtml(item.item)}</h4><p>${siteName(item.siteId)} | Balance approx. ${item.balance}</p></article>`);

  const labourAlerts = state.wages
    .filter((item) => number(item.amount) > 0 && item.attendance !== "Absent")
    .slice(0, 3)
    .map((item) => `<article class="activity-card"><h4>Labour payment reminder</h4><p>${escapeHtml(item.worker)} | ${siteName(item.siteId)} | ${formatMoney(item.amount)}</p></article>`);

  const billAlerts = state.customerBills
    .filter((item) => item.status !== "Paid")
    .map((item) => `<article class="activity-card"><h4>Client bill due</h4><p>${escapeHtml(item.billNo || item.work)} | ${escapeHtml(item.client || "-")} | ${formatMoney(item.total)}</p></article>`);

  const alerts = [...materialAlerts, ...labourAlerts, ...billAlerts].slice(0, 6).join("");
  document.getElementById("notificationRows").innerHTML = alerts || emptyCard("No alerts right now.");
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

function renderRateList() {
  const rows = state.rateList.sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${escapeHtml(item.category || "-")}</td>
    <td><strong>${escapeHtml(item.work)}</strong></td>
    <td>${escapeHtml(item.unit || "-")}</td>
    <td class="amount">${formatMoney(item.rate)}</td>
    <td>${escapeHtml(item.note || "-")}</td>
    <td><button class="delete-btn" data-delete="rateList:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("rateListRows").innerHTML = rows || emptyRow(7);
}

function renderCustomerBills() {
  const rows = filtered(state.customerBills).sort(byDateDesc).map((bill) => `<tr>
    <td>${dateText(bill.date)}</td>
    <td>${escapeHtml(bill.billNo || "-")}</td>
    <td>${siteName(bill.siteId)}</td>
    <td>${escapeHtml(bill.client || "-")}</td>
    <td><strong>${escapeHtml(bill.work)}</strong><br><span>${escapeHtml(bill.note || "")}</span></td>
    <td>${bill.quantity} ${escapeHtml(bill.unit || "")}</td>
    <td class="amount">${formatMoney(bill.rate)}</td>
    <td class="amount">${formatMoney(bill.total)}</td>
    <td><span class="status-pill ${bill.status === "Paid" ? "success-pill" : bill.status === "Part Paid" ? "warning-pill" : "danger-pill"}">${escapeHtml(bill.status || "Unpaid")}</span></td>
    <td class="action-stack">
      <button class="paid-btn" data-print-bill="${bill.id}" type="button">Print Bill</button>
      <button class="delete-btn" data-delete="customerBills:${bill.id}" type="button">Delete</button>
    </td>
  </tr>`).join("");
  document.getElementById("customerBillRows").innerHTML = rows || emptyRow(10);
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
    <td>${escapeHtml(item.category || "-")}</td>
    <td>${number(item.quantityReceived) - number(item.quantityUsed)} ${escapeHtml(item.unit || "")}</td>
    <td>${escapeHtml(item.supplier || "-")}</td>
    <td>${escapeHtml(item.billNo || "-")}</td>
    <td class="amount">${formatMoney(item.amount)}</td>
    <td><button class="delete-btn" data-delete="materials:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("materialRows").innerHTML = rows || emptyRow(9);
}

function renderExpenses() {
  const rows = filtered(state.expenses).sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${siteName(item.siteId)}</td>
    <td>${escapeHtml(item.type)}</td>
    <td><strong>${escapeHtml(item.title)}</strong><br><span>${escapeHtml(item.notes || "")}</span></td>
    <td>${escapeHtml(item.paidTo || "-")}</td>
    <td class="amount">${formatMoney(item.amount)}</td>
    <td><button class="delete-btn" data-delete="expenses:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("expenseRows").innerHTML = rows || emptyRow(7);
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

function renderMeasurements() {
  const rows = filtered(state.measurements).sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${siteName(item.siteId)}</td>
    <td>${escapeHtml(item.area || "-")}</td>
    <td>${item.plasterSqft}</td>
    <td>${item.popSqft}</td>
    <td>${item.tileSqft}</td>
    <td>${item.waterproofingSqft}</td>
    <td>${item.paintingSqft}</td>
    <td>${item.electricalPoints}</td>
    <td>${item.runningFeet}</td>
    <td><strong>${item.total}</strong></td>
    <td><button class="delete-btn" data-delete="measurements:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("measurementRows").innerHTML = rows || emptyRow(12);
}

function renderBoq() {
  const rows = filtered(state.boq).map((item) => `<tr>
    <td>${siteName(item.siteId)}</td>
    <td><strong>${escapeHtml(item.item)}</strong><br><span>${escapeHtml(item.notes || "")}</span></td>
    <td>${escapeHtml(item.unit || "-")}</td>
    <td>${item.estimatedQuantity}</td>
    <td class="amount">${formatMoney(item.estimatedCost)}</td>
    <td>${item.actualQuantity}</td>
    <td class="amount">${formatMoney(item.actualCost)}</td>
    <td class="amount">${formatMoney(item.variance)}</td>
    <td><button class="delete-btn" data-delete="boq:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("boqRows").innerHTML = rows || emptyRow(9);
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

function renderDiary() {
  const rows = filtered(state.diary).sort(byDateDesc).map((item) => `<article class="activity-card">
    <header>
      <div>
        <h4>${siteName(item.siteId)}</h4>
        <time>${dateText(item.date)} | ${escapeHtml(item.weather || "Weather not set")}</time>
      </div>
      <button class="delete-btn" data-delete="diary:${item.id}" type="button">Delete</button>
    </header>
    <p><strong>Notes:</strong> ${escapeHtml(item.dailyNotes || "-")}</p>
    <p><strong>Labour:</strong> ${escapeHtml(item.labourIssues || "-")}</p>
    <p><strong>Material:</strong> ${escapeHtml(item.materialIssues || "-")}</p>
    <p><strong>Client:</strong> ${escapeHtml(item.clientInstructions || "-")}</p>
  </article>`).join("");
  document.getElementById("diaryRows").innerHTML = rows || emptyCard("No diary entries yet.");
}

function renderTools() {
  renderWageCalendar();
  renderSiteMeasurementTools();
  renderEquipment();
  renderQuotations();
}

function renderWageCalendar() {
  const rows = state.tools.wageCalendar.sort(byMonthDesc).map((item) => `<tr>
    <td>${escapeHtml(item.month || "-")}</td>
    <td>${siteNameOptional(item.siteId)}</td>
    <td><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml(item.attendance || "")}</span></td>
    <td>${item.presentCount || 0}</td>
    <td>${item.halfCount || 0}</td>
    <td>${item.doubleCount || 0}</td>
    <td>${item.absentCount || 0}</td>
    <td class="amount">${formatMoney(item.totalWage)}</td>
    <td><button class="delete-btn" data-delete-tool="wageCalendar:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("wageCalendarRows").innerHTML = rows || emptyRow(9);
}

function renderSiteMeasurementTools() {
  const rows = state.tools.measurements.sort(byDateDesc).map((item) => {
    const photo = item.photo ? `<div class="site-photo-grid"><img src="${item.photo}" alt="Measurement photo"></div>` : "";
    return `<article class="activity-card">
      <header>
        <div>
          <h4>${escapeHtml(item.area || "Measurement")} | ${siteNameOptional(item.siteId)}</h4>
          <time>${dateText(item.date)} | ${formatDimension(item.length)} x ${formatDimension(item.width)} x ${formatDimension(item.height)}</time>
        </div>
        <button class="delete-btn" data-delete-tool="measurements:${item.id}" type="button">Delete</button>
      </header>
      <p><strong>Sqft:</strong> ${round(item.sqft, 2)} | <strong>Cft:</strong> ${round(item.cft, 2)}</p>
      <p>${escapeHtml(item.notes || "-")}</p>
      ${photo}
    </article>`;
  }).join("");
  document.getElementById("siteMeasurementToolRows").innerHTML = rows || emptyCard("No measurement records yet.");
}

function renderEquipment() {
  const rows = state.tools.equipment.map((item) => `<tr>
    <td><strong>${escapeHtml(item.toolName)}</strong></td>
    <td>${item.quantity || 0}</td>
    <td>${item.purchaseDate ? dateText(item.purchaseDate) : "-"}</td>
    <td class="amount">${formatMoney(item.cost)}</td>
    <td>${escapeHtml(item.assignedTo || "-")}</td>
    <td>${siteNameOptional(item.siteId)}</td>
    <td><span class="status-pill ${toolStatusClass(item.status)}">${escapeHtml(item.status || "Available")}</span></td>
    <td><button class="delete-btn" data-delete-tool="equipment:${item.id}" type="button">Delete</button></td>
  </tr>`).join("");
  document.getElementById("equipmentRows").innerHTML = rows || emptyRow(8);
}

function renderQuotations() {
  const rows = state.tools.quotations.sort(byDateDesc).map((item) => `<tr>
    <td>${dateText(item.date)}</td>
    <td>${escapeHtml(item.quoteNo || "-")}</td>
    <td>${escapeHtml(item.client || "-")}</td>
    <td><strong>${escapeHtml(item.workType)}</strong></td>
    <td>${formatQuantity(item.area, item.unit)}</td>
    <td class="amount">${formatMoney(item.total)}</td>
    <td class="action-stack">
      <button class="paid-btn" data-print-quote="${item.id}" type="button">Print Quote</button>
      <button class="delete-btn" data-delete-tool="quotations:${item.id}" type="button">Delete</button>
    </td>
  </tr>`).join("");
  document.getElementById("quotationRows").innerHTML = rows || emptyRow(7);
}

function renderSettings() {
  const form = document.getElementById("settingsForm");
  if (!form) return;
  Object.entries(state.settings || {}).forEach(([key, value]) => {
    const element = form.elements[key];
    if (!element || element.type === "file") return;
    if (element.type === "color" && !value) return;
    element.value = value || "";
  });
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
    ["rate_list", state.rateList],
    ["customer_bills", state.customerBills],
    ["extra_works", state.extraWorks],
    ["wages", state.wages.map(({ photo, ...row }) => ({ ...row, photo: photo ? "Saved in app" : "" }))],
    ["materials", state.materials],
    ["expenses", state.expenses],
    ["payments", state.payments],
    ["pending_bills", state.bills],
    ["measurement_book", state.measurements],
    ["boq", state.boq],
    ["schedule_targets", state.schedule],
    ["progress", state.progress],
    ["site_diary", state.diary],
    ["daily_updates", state.updates.map(({ photos, ...row }) => ({ ...row, photos: Array.isArray(photos) && photos.length ? `${photos.length} saved in app` : "" }))],
    ["tool_wage_calendar", state.tools.wageCalendar],
    ["tool_measurements", state.tools.measurements.map(({ photo, ...row }) => ({ ...row, photo: photo ? "Saved in app" : "" }))],
    ["tool_equipment", state.tools.equipment],
    ["tool_quotations", state.tools.quotations]
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
  setPrintableDocument(reportDocumentHtml(), "H&H SPACES Report");
  document.getElementById("reportModal").classList.remove("is-hidden");
}

function openCustomerBillPreview(billId) {
  const bill = state.customerBills.find((item) => item.id === billId);
  if (!bill) return;
  setPrintableDocument(customerBillDocumentHtml(bill), `Bill ${bill.billNo || ""}`.trim());
  document.querySelector("#reportModal strong").textContent = `Bill ${bill.billNo || ""}`.trim();
  document.querySelector("#reportModal span").textContent = "On iPhone, tap Print / Save PDF, then Share > Save to Files.";
  document.getElementById("reportModal").classList.remove("is-hidden");
}

function openQuotationPreview(quoteId) {
  const quote = state.tools.quotations.find((item) => item.id === quoteId);
  if (!quote) return;
  setPrintableDocument(quotationDocumentHtml(quote), `Quotation ${quote.quoteNo || ""}`.trim());
  document.querySelector("#reportModal strong").textContent = `Quotation ${quote.quoteNo || ""}`.trim();
  document.querySelector("#reportModal span").textContent = "On iPhone, tap Print / Save PDF, then Share > Save to Files.";
  document.getElementById("reportModal").classList.remove("is-hidden");
}

function setPrintableDocument(html, title) {
  currentPrintableHtml = html;
  currentPrintableTitle = title || "H&H SPACES Document";
  document.getElementById("reportFrame").srcdoc = html;
}

function printReportPreview() {
  if (!currentPrintableHtml) {
    setPrintableDocument(reportDocumentHtml(), "H&H SPACES Report");
  }
  openPrintablePage(currentPrintableHtml, currentPrintableTitle);
}

function openPrintablePage(html, title) {
  const printableHtml = html.replace("</body>", `<script>window.addEventListener('load',function(){setTimeout(function(){window.focus();window.print();},350);});<\/script></body>`);
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();
    return;
  }
  downloadFile(html, `${fileSafeName(title)}.html`, "text/html");
  alert("iPhone blocked the print page. An HTML copy was downloaded. Open it, tap Share, then Print or Save to Files.");
}

function closeReportPreview() {
  document.getElementById("reportModal").classList.add("is-hidden");
  document.querySelector("#reportModal strong").textContent = "Report Preview";
  document.querySelector("#reportModal span").textContent = "Print or save as PDF";
  currentPrintableHtml = "";
  currentPrintableTitle = "H&H SPACES Report";
}

function customerBillDocumentHtml(bill) {
  const settings = state.settings || {};
  const site = findSite(bill.siteId);
  const companyName = (settings.companyName || "H&H SPACES").toUpperCase();
  const companySubtitle = settings.pdfHeader || "SPECIALIST IN ALL TYPES OF INTERIOR WORK | RESIDENTIAL | COMMERCIAL & CIVIL";
  const clientName = bill.client || site.client || "Client";
  const clientAddress = bill.clientAddress || site.location || "";
  const subtotal = number(bill.amount || (number(bill.quantity) * number(bill.rate)));
  const discount = number(bill.discount);
  const tax = number(bill.tax);
  const total = number(bill.total || Math.max(subtotal - discount + tax, 0));
  const logo = settings.logo && settings.companyLogoOnPdf !== "Hide"
    ? `<img class="invoice-logo" src="${settings.logo}" alt="Company logo">`
    : "";
  const signature = settings.signature
    ? `<img class="signature-img" src="${settings.signature}" alt="Signature">`
    : `<div class="signature-line"></div>`;

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(companyName)} Bill ${escapeHtml(bill.billNo || "")}</title>
        <style>${customerBillCss()}</style>
      </head>
      <body>
        <main class="invoice-page">
          <header class="invoice-header">
            ${logo}
            <h1>${escapeHtml(companyName)}</h1>
            <p>${escapeHtml(companySubtitle)}</p>
            ${settings.phone ? `<p>Mob: ${escapeHtml(settings.phone)}</p>` : ""}
            ${settings.email ? `<p>Email: ${escapeHtml(settings.email)}</p>` : ""}
            ${settings.address ? `<p>${linesToHtml(settings.address)}</p>` : ""}
          </header>

          <h2>BILL</h2>

          <section class="bill-meta">
            <div>
              <h3>BILL TO:</h3>
              <strong>${escapeHtml(clientName)}</strong>
              ${clientAddress ? `<p>${linesToHtml(clientAddress)}</p>` : ""}
              <dl>
                <div><dt>PAN:</dt><dd>${escapeHtml(bill.clientPan || "-")}</dd></div>
                <div><dt>GST NO:</dt><dd>${escapeHtml(bill.clientGst || "-")}</dd></div>
                <div><dt>Email:</dt><dd>${escapeHtml(bill.clientEmail || "-")}</dd></div>
              </dl>
            </div>
            <div class="bill-date">
              <dl>
                <div><dt>Bill No:</dt><dd>${escapeHtml(bill.billNo || "-")}</dd></div>
                <div><dt>Date:</dt><dd>${dateText(bill.date)}</dd></div>
                <div><dt>Site:</dt><dd>${escapeHtml(site.name || "-")}</dd></div>
              </dl>
            </div>
          </section>

          <table class="invoice-table">
            <thead>
              <tr>
                <th>S.NO</th>
                <th>DESCRIPTION</th>
                <th>QUANTITY / DETAILS</th>
                <th>AMOUNT (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>
                  <strong>${escapeHtml(bill.work)}</strong>
                  ${bill.note ? `<small>${linesToHtml(bill.note)}</small>` : ""}
                </td>
                <td>${escapeHtml(formatQuantity(bill.quantity, bill.unit))}</td>
                <td>${formatInvoiceAmount(subtotal)}</td>
              </tr>
              ${discount ? `<tr class="adjustment"><td></td><td colspan="2">Discount</td><td>- ${formatInvoiceAmount(discount)}</td></tr>` : ""}
              ${tax ? `<tr class="adjustment"><td></td><td colspan="2">GST / Tax</td><td>${formatInvoiceAmount(tax)}</td></tr>` : ""}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Total:</td>
                <td>${formatInvoiceAmount(total)}</td>
              </tr>
            </tfoot>
          </table>

          <footer class="invoice-footer">
            <div>
              <strong>${escapeHtml(companyName)}</strong>
              ${settings.gstNumber ? `<p>GST NO: ${escapeHtml(settings.gstNumber)}</p>` : ""}
              ${settings.panNumber ? `<p>PAN: ${escapeHtml(settings.panNumber)}</p>` : ""}
              ${settings.bankDetails ? `<p>${linesToHtml(settings.bankDetails)}</p>` : ""}
              ${settings.upiId ? `<p>UPI: ${escapeHtml(settings.upiId)}</p>` : ""}
            </div>
            <div class="signature">
              <p>For ${escapeHtml(toTitleCase(companyName))}</p>
              ${signature}
              <strong>Authorized Signatory</strong>
            </div>
          </footer>
        </main>
      </body>
    </html>`;
}

function quotationDocumentHtml(quote) {
  const settings = state.settings || {};
  const companyName = (settings.companyName || "H&H SPACES").toUpperCase();
  const subtotal = number(quote.baseCost) + number(quote.profit);
  const gst = number(quote.gst);
  const total = number(quote.total);
  const logo = settings.logo && settings.companyLogoOnPdf !== "Hide"
    ? `<img class="invoice-logo" src="${settings.logo}" alt="Company logo">`
    : "";

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(companyName)} Quotation ${escapeHtml(quote.quoteNo || "")}</title>
        <style>${customerBillCss()}</style>
      </head>
      <body>
        <main class="invoice-page">
          <header class="invoice-header">
            ${logo}
            <h1>${escapeHtml(companyName)}</h1>
            <p>${escapeHtml(settings.pdfHeader || "SPECIALIST IN ALL TYPES OF INTERIOR WORK | RESIDENTIAL | COMMERCIAL & CIVIL")}</p>
            ${settings.phone ? `<p>Mob: ${escapeHtml(settings.phone)}</p>` : ""}
            ${settings.email ? `<p>Email: ${escapeHtml(settings.email)}</p>` : ""}
            ${settings.address ? `<p>${linesToHtml(settings.address)}</p>` : ""}
          </header>

          <h2>QUOTATION</h2>

          <section class="bill-meta">
            <div>
              <h3>QUOTATION TO:</h3>
              <strong>${escapeHtml(quote.client || "Client")}</strong>
              <dl>
                <div><dt>Work:</dt><dd>${escapeHtml(quote.workType || "-")}</dd></div>
                <div><dt>Area:</dt><dd>${escapeHtml(formatQuantity(quote.area, quote.unit))}</dd></div>
              </dl>
            </div>
            <div class="bill-date">
              <dl>
                <div><dt>Quote No:</dt><dd>${escapeHtml(quote.quoteNo || "-")}</dd></div>
                <div><dt>Date:</dt><dd>${dateText(quote.date)}</dd></div>
                <div><dt>GST:</dt><dd>${round(quote.gstPercent, 2)}%</dd></div>
              </dl>
            </div>
          </section>

          <table class="invoice-table">
            <thead>
              <tr>
                <th>S.NO</th>
                <th>DESCRIPTION</th>
                <th>QUANTITY / DETAILS</th>
                <th>AMOUNT (Rs.)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1</td><td>Labour Cost @ ${formatInvoiceAmount(quote.labourRate)} / ${escapeHtml(quote.unit || "unit")}</td><td>${escapeHtml(formatQuantity(quote.area, quote.unit))}</td><td>${formatInvoiceAmount(number(quote.area) * number(quote.labourRate))}</td></tr>
              <tr><td>2</td><td>Material Cost @ ${formatInvoiceAmount(quote.materialRate)} / ${escapeHtml(quote.unit || "unit")}</td><td>${escapeHtml(formatQuantity(quote.area, quote.unit))}</td><td>${formatInvoiceAmount(number(quote.area) * number(quote.materialRate))}</td></tr>
              <tr class="adjustment"><td></td><td colspan="2">Profit / overhead ${round(quote.profitPercent, 2)}%</td><td>${formatInvoiceAmount(quote.profit)}</td></tr>
              <tr class="adjustment"><td></td><td colspan="2">GST ${round(quote.gstPercent, 2)}%</td><td>${formatInvoiceAmount(gst)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td colspan="3">Total Quotation:</td><td>${formatInvoiceAmount(total)}</td></tr>
            </tfoot>
          </table>

          ${quote.terms ? `<section class="quotation-terms"><h3>Terms</h3><p>${linesToHtml(quote.terms)}</p></section>` : ""}

          <footer class="invoice-footer">
            <div>
              <strong>${escapeHtml(companyName)}</strong>
              ${settings.gstNumber ? `<p>GST NO: ${escapeHtml(settings.gstNumber)}</p>` : ""}
              ${settings.upiId ? `<p>UPI: ${escapeHtml(settings.upiId)}</p>` : ""}
            </div>
            <div class="signature">
              <p>For ${escapeHtml(toTitleCase(companyName))}</p>
              <div class="signature-line"></div>
              <strong>Authorized Signatory</strong>
            </div>
          </footer>
        </main>
      </body>
    </html>`;
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
        ${reportSection("Rate List", report.rateList)}
        ${reportSection("Customer Bills", report.customerBills)}
        ${reportSection("Extra Site Works", report.extraWorks)}
        ${reportSection("Labour Wages", report.wages)}
        ${reportSection("Material Expenses", report.materials)}
        ${reportSection("Expenses", report.expenses)}
        ${reportSection("Client Payments", report.payments)}
        ${reportSection("Pending Bills", report.bills)}
        ${reportSection("Measurement Book", report.measurements)}
        ${reportSection("BOQ", report.boq)}
        ${reportSection("Schedule & Targets", report.schedule)}
        ${reportSection("Work Progress", report.progress)}
        ${reportSection("Site Diary", report.diary)}
        ${reportSection("Daily Updates", report.updates)}
        ${reportSection("Tool Equipment", report.equipment)}
        ${reportSection("Tool Quotations", report.quotations)}
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
        ${excelTable("Rate List", report.rateList)}
        ${excelTable("Customer Bills", report.customerBills)}
        ${excelTable("Extra Site Works", report.extraWorks)}
        ${excelTable("Labour Wages", report.wages)}
        ${excelTable("Material Expenses", report.materials)}
        ${excelTable("Expenses", report.expenses)}
        ${excelTable("Client Payments", report.payments)}
        ${excelTable("Pending Bills", report.bills)}
        ${excelTable("Measurement Book", report.measurements)}
        ${excelTable("BOQ", report.boq)}
        ${excelTable("Schedule Targets", report.schedule)}
        ${excelTable("Work Progress", report.progress)}
        ${excelTable("Site Diary", report.diary)}
        ${excelTable("Daily Updates", report.updates)}
        ${excelTable("Tool Equipment", report.equipment)}
        ${excelTable("Tool Quotations", report.quotations)}
      </body>
    </html>`;
}

function buildReportData() {
  const wages = filtered(state.wages);
  const materials = filtered(state.materials);
  const expenses = filtered(state.expenses);
  const extraWorks = filtered(state.extraWorks);
  const customerBills = filtered(state.customerBills);
  const payments = filtered(state.payments);
  const pendingBills = filtered(state.bills).filter((bill) => bill.status !== "Paid");
  const paidBills = filtered(state.bills).filter((bill) => bill.status === "Paid");
  const capital = filtered(state.capital);
  const capitalTotal = sum(capital.filter((item) => item.type === "add"), "amount") - sum(capital.filter((item) => item.type === "withdraw"), "amount");
  const used = sum(wages, "amount") + sum(materials, "amount") + sum(expenses, "amount") + sum(paidBills, "amount");
  const received = sum(payments, "amount");
  const cash = capitalTotal + received - used;

  return {
    summary: [
      { label: "Cash In Hand", value: formatMoney(cash) },
      { label: "Company Capital", value: formatMoney(capitalTotal) },
      { label: "Client Payments", value: formatMoney(received) },
      { label: "Customer Bills", value: formatMoney(sum(customerBills, "total")) },
      { label: "Extra Site Works", value: formatMoney(sum(extraWorks, "amount")) },
      { label: "Payment Used", value: formatMoney(used) },
      { label: "Pending Bills", value: formatMoney(sum(pendingBills, "amount")) },
      { label: "Labour Wages", value: formatMoney(sum(wages, "amount")) },
      { label: "Material Expenses", value: formatMoney(sum(materials, "amount")) },
      { label: "Other Expenses", value: formatMoney(sum(expenses, "amount")) }
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
    rateList: state.rateList.map((item) => ({
      Date: dateText(item.date),
      Category: item.category || "",
      Work: item.work,
      Unit: item.unit || "",
      Rate: formatMoney(item.rate),
      Note: item.note || ""
    })),
    customerBills: customerBills.map((item) => ({
      Date: dateText(item.date),
      Bill: item.billNo || "",
      Site: plainSiteName(item.siteId),
      Client: item.client || "",
      Work: item.work,
      Quantity: item.quantity,
      Unit: item.unit || "",
      Rate: formatMoney(item.rate),
      Amount: formatMoney(item.amount),
      Discount: formatMoney(item.discount),
      Tax: formatMoney(item.tax),
      Total: formatMoney(item.total),
      Status: item.status || "Unpaid"
    })),
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
      Category: item.category || "",
      Unit: item.unit || "",
      Received: item.quantityReceived || 0,
      Used: item.quantityUsed || 0,
      Balance: number(item.quantityReceived) - number(item.quantityUsed),
      Supplier: item.supplier || "",
      Bill: item.billNo || "",
      Amount: formatMoney(item.amount)
    })),
    expenses: expenses.map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Type: item.type,
      Title: item.title,
      "Paid To": item.paidTo || "",
      Amount: formatMoney(item.amount),
      Notes: item.notes || ""
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
    measurements: filtered(state.measurements).map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Area: item.area || "",
      Plaster: item.plasterSqft,
      POP: item.popSqft,
      Tile: item.tileSqft,
      Waterproofing: item.waterproofingSqft,
      Painting: item.paintingSqft,
      Points: item.electricalPoints,
      RFT: item.runningFeet,
      Total: item.total,
      Notes: item.notes || ""
    })),
    boq: filtered(state.boq).map((item) => ({
      Site: plainSiteName(item.siteId),
      Item: item.item,
      Unit: item.unit,
      "Estimated Qty": item.estimatedQuantity,
      "Estimated Cost": formatMoney(item.estimatedCost),
      "Actual Qty": item.actualQuantity,
      "Actual Cost": formatMoney(item.actualCost),
      Variance: formatMoney(item.variance),
      Notes: item.notes || ""
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
    diary: filtered(state.diary).map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Weather: item.weather || "",
      Notes: item.dailyNotes || "",
      LabourIssues: item.labourIssues || "",
      MaterialIssues: item.materialIssues || "",
      ClientInstructions: item.clientInstructions || ""
    })),
    updates: filtered(state.updates).map((item) => ({
      Date: dateText(item.date),
      Site: plainSiteName(item.siteId),
      Labour: item.labourCount || 0,
      Weather: item.weather || "",
      WorkDone: item.workDone,
      NextPlan: item.nextPlan || "",
      Photos: Array.isArray(item.photos) ? item.photos.length : 0
    })),
    equipment: state.tools.equipment.map((item) => ({
      Tool: item.toolName,
      Quantity: item.quantity || 0,
      Purchase: item.purchaseDate ? dateText(item.purchaseDate) : "",
      Cost: formatMoney(item.cost),
      Assigned: item.assignedTo || "",
      Site: plainSiteName(item.siteId),
      Status: item.status || ""
    })),
    quotations: state.tools.quotations.map((item) => ({
      Date: dateText(item.date),
      Quote: item.quoteNo || "",
      Client: item.client || "",
      Work: item.workType,
      Area: formatQuantity(item.area, item.unit),
      "Labour Rate": formatMoney(item.labourRate),
      "Material Rate": formatMoney(item.materialRate),
      Profit: formatMoney(item.profit),
      GST: formatMoney(item.gst),
      Total: formatMoney(item.total)
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

function customerBillCss() {
  return `@page{size:A4;margin:18mm}*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif}.invoice-page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:20mm 18mm;border:1px solid #e5e7eb}.invoice-header{text-align:center;border-bottom:2px solid #111827;padding-bottom:12px}.invoice-logo{max-width:92px;max-height:70px;object-fit:contain;margin-bottom:8px}.invoice-header h1{margin:0;color:#111827;font-size:28px;font-weight:900;letter-spacing:.5px}.invoice-header p{margin:5px 0 0;font-size:12px;font-weight:700}.invoice-page h2{text-align:center;margin:18px 0 16px;font-size:22px;text-decoration:underline;letter-spacing:1px}.bill-meta{display:grid;grid-template-columns:1fr 210px;gap:24px;margin-bottom:18px}.bill-meta h3{margin:0 0 8px;font-size:14px}.bill-meta strong{display:block;margin-bottom:5px;font-size:15px}.bill-meta p{margin:4px 0;font-size:12px;line-height:1.45}dl{margin:10px 0 0}dl div{display:grid;grid-template-columns:74px 1fr;gap:8px;margin-top:6px;font-size:12px}dt{font-weight:900}dd{margin:0}.bill-date{border:1px solid #111827;padding:10px 12px;align-self:start}.bill-date dl{margin:0}.invoice-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}.invoice-table th,.invoice-table td{border:1px solid #111827;padding:10px;text-align:left;vertical-align:top}.invoice-table th{background:#f3f4f6;text-align:center;font-weight:900}.invoice-table th:first-child,.invoice-table td:first-child{width:48px;text-align:center}.invoice-table th:nth-child(3),.invoice-table td:nth-child(3){width:150px;text-align:center}.invoice-table th:last-child,.invoice-table td:last-child{width:140px;text-align:right}.invoice-table small{display:block;margin-top:6px;color:#4b5563;line-height:1.45}.invoice-table .adjustment td{font-weight:700}.invoice-table tfoot td{font-size:14px;font-weight:900}.invoice-table tfoot td:first-child{text-align:right}.quotation-terms{margin-top:22px;border:1px solid #111827;padding:12px}.quotation-terms h3{margin:0 0 8px;font-size:14px}.quotation-terms p{margin:0;font-size:12px;line-height:1.5}.invoice-footer{display:grid;grid-template-columns:1fr 220px;gap:24px;margin-top:34px;align-items:end}.invoice-footer p{margin:6px 0 0;font-size:12px;line-height:1.45}.signature{text-align:center}.signature p{font-weight:700}.signature-img{max-width:150px;max-height:70px;margin:18px auto 8px;object-fit:contain}.signature-line{height:52px;border-bottom:1px solid #111827;margin:12px 22px 8px}@media print{body{background:#fff}.invoice-page{width:auto;min-height:auto;margin:0;padding:0;border:0}}`;
}

function formatInvoiceAmount(value) {
  return number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(quantity, unit) {
  const qty = number(quantity);
  const formatted = Number.isInteger(qty) ? String(qty) : qty.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${formatted} ${unit || ""}`.trim();
}

function linesToHtml(value) {
  return escapeHtml(value || "").replace(/\n/g, "<br>");
}

function toTitleCase(value) {
  return String(value || "").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileSafeName(value) {
  return String(value || "hh-spaces-document")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "hh-spaces-document";
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

function siteNameOptional(siteId) {
  return siteId ? siteName(siteId) : "All sites";
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

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(number(value) * factor) / factor;
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

function byMonthDesc(a, b) {
  return String(b.month || "").localeCompare(String(a.month || ""));
}

function byTargetDateAsc(a, b) {
  return String(a.targetDate || a.date || "").localeCompare(String(b.targetDate || b.date || ""));
}

function wageCalendarSummary(attendance, dailyWage) {
  const codes = String(attendance || "")
    .split(/[\s,]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  const presentCount = codes.filter((code) => code === "P").length;
  const halfCount = codes.filter((code) => code === "H").length;
  const doubleCount = codes.filter((code) => code === "PP").length;
  const absentCount = codes.filter((code) => code === "A").length;
  return {
    presentCount,
    halfCount,
    doubleCount,
    absentCount,
    totalWage: (presentCount * dailyWage) + (halfCount * dailyWage * 0.5) + (doubleCount * dailyWage * 2)
  };
}

function toolStatusClass(status) {
  if (status === "Available") return "success-pill";
  if (status === "In Use") return "warning-pill";
  if (status === "Under Repair") return "neutral-pill";
  return "danger-pill";
}

function formatDimension(value) {
  return number(value) ? round(value, 2) : "-";
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
