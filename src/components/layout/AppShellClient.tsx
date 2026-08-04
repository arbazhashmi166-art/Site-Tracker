"use client";

import { CirclePlus, Moon, Search, Sparkles, Sun, type LucideIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { appName } from "@/lib/env";
import { useAuth } from "@/lib/auth";
import { useRecords } from "@/lib/repository";
import { adaptiveModeStorageKey, selectedSiteStorageKey, useUiStore } from "@/lib/ui-store";
import { appRoutes, mainTabs, quickActionGroups } from "@/config/routes";
import { SyncStatusCard } from "@/features/sync/SyncStatusCard";
import { useSyncStatus } from "@/features/sync/useSyncStatus";
import { AppIcon } from "@/components/ui/app-icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/utils/format";
import { adaptiveShellEngine } from "@/utils/adaptive-engine";
import styles from "./AppShell.module.css";

type SearchResult = {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  keywords: string;
  rank: number;
  type: "Action" | "Page" | "Record";
};

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { company, loading, offlineMode, session } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const mode = useUiStore((state) => state.mode);
  const toggleMode = useUiStore((state) => state.toggleMode);
  const adaptiveMode = useUiStore((state) => state.adaptiveMode);
  const setAdaptiveMode = useUiStore((state) => state.setAdaptiveMode);
  const selectedSiteId = useUiStore((state) => state.selectedSiteId);
  const setSelectedSiteId = useUiStore((state) => state.setSelectedSiteId);
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewportWidth, setViewportWidth] = useState(393);
  const lastNavigationRef = useRef({ path: "", at: 0 });
  const sites = useRecords("sites", company?.id);
  const syncStatus = useSyncStatus({
    companyId: company?.id,
    offlineMode,
    hasSession: Boolean(session)
  });
  const searchTerm = query.trim().toLowerCase();
  const searchRecordsEnabled = searchOpen && searchTerm.length > 1;
  const searchLabour = useRecords("labour", company?.id, { enabled: searchRecordsEnabled });
  const searchMaterials = useRecords("materials", company?.id, { enabled: searchRecordsEnabled });
  const searchExpenses = useRecords("expenses", company?.id, { enabled: searchRecordsEnabled });
  const searchPayments = useRecords("client_payments", company?.id, { enabled: searchRecordsEnabled });
  const searchSuppliers = useRecords("suppliers", company?.id, { enabled: searchRecordsEnabled });
  const searchProgress = useRecords("progress_updates", company?.id, { enabled: searchRecordsEnabled });
  const searchExtraWorks = useRecords("extra_works", company?.id, { enabled: searchRecordsEnabled });
  const searchPartnerDraws = useRecords("partner_draws", company?.id, { enabled: searchRecordsEnabled });
  const showQuickAdd =
    !pathname.startsWith("/quick-entry") &&
    !pathname.startsWith("/settings") &&
    !pathname.startsWith("/ai") &&
    !pathname.startsWith("/payment-recovery") &&
    !pathname.startsWith("/daily-closing") &&
    !pathname.startsWith("/partner-ledger") &&
    !pathname.startsWith("/business-brain") &&
    !pathname.startsWith("/cash-flow") &&
    !pathname.startsWith("/approval-center") &&
    !pathname.startsWith("/rate-analyzer") &&
    !pathname.startsWith("/bill-scanner");
  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth || 393);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  useEffect(() => {
    setHydrated(true);
    setOfflineReady(window.localStorage.getItem("sitetracker.offlineMode") === "1");
    const savedSiteId = window.localStorage.getItem(selectedSiteStorageKey) || "";
    if (savedSiteId) setSelectedSiteId(savedSiteId);
    const savedAdaptiveMode = window.localStorage.getItem(adaptiveModeStorageKey);
    if (savedAdaptiveMode) setAdaptiveMode(savedAdaptiveMode !== "0");
  }, [setAdaptiveMode, setSelectedSiteId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!loading && !company && !offlineReady) router.replace("/login");
  }, [company, hydrated, loading, offlineReady, router]);

  const activeSites = useMemo(() => (sites.data || []).filter((site) => site.status !== "completed"), [sites.data]);
  const selectedSite = useMemo(() => (sites.data || []).find((site) => site.id === selectedSiteId) || null, [selectedSiteId, sites.data]);
  const adaptiveState = useMemo(
    () =>
      adaptiveShellEngine({
        enabled: adaptiveMode,
        pathname,
        viewportWidth,
        activeSiteCount: activeSites.length,
        selectedSiteName: selectedSite?.name || null,
        sync: syncStatus
      }),
    [activeSites.length, adaptiveMode, pathname, selectedSite?.name, syncStatus, viewportWidth]
  );
  const crowdedEntryRoute = [
    "/quick-entry",
    "/sites",
    "/labour",
    "/attendance",
    "/materials",
    "/expenses",
    "/payments",
    "/supplier-payments",
    "/progress",
    "/extra-works",
    "/partner-draws",
    "/reminders",
    "/staff"
  ].some((route) => pathname.startsWith(route));
  const showAiButton = !adaptiveState.shouldHideFloatingAi && !crowdedEntryRoute;
  const aiRoute = `/ai?prompt=${encodeURIComponent(adaptiveState.command.aiPrompt)}`;
  const focusedToolRoute = pathname.startsWith("/rate-analyzer") || pathname.startsWith("/bill-scanner");

  useEffect(() => {
    if (!selectedSiteId || sites.isLoading) return;
    if (!(sites.data || []).length) return;
    if ((sites.data || []).some((site) => site.id === selectedSiteId)) return;
    setSelectedSiteId("");
  }, [selectedSiteId, setSelectedSiteId, sites.data, sites.isLoading]);

  const searchResults = useMemo(() => {
    const routeResults = appRoutes.map((route) => ({
      id: `route-${route.path}-${route.label}`,
      label: route.label,
      description: route.description,
      path: route.path,
      icon: route.icon,
      keywords: `${route.label} ${route.description}`.toLowerCase(),
      rank: 2,
      type: "Page" as const
    }));
    const cleanPath = (path: string) => path.split("?")[0]?.split("#")[0] || path;
    const iconFor = (path: string) => appRoutes.find((route) => cleanPath(route.path) === cleanPath(path))?.icon || Search;
    const recordPath = (path: string, search: string) => `${path}?search=${encodeURIComponent(search)}`;
    const commands = [
      {
        label: "Quick Entry Hub",
        description: "Open the one-tap daily add screen for attendance, expense, material, payment, progress, and extra work.",
        path: "/quick-entry",
        keywords: "quick entry quick add fast add daily entry shortcut one tap attendance material expense payment progress extra work",
        rank: 0
      },
      {
        label: "Create Bill or Client Payment",
        description: "Record received amount, pending amount, payment mode, and site-wise client balance.",
        path: "/payments?add=1",
        keywords: "bill invoice quotation quote client payment receipt pending collection finance customer",
        rank: 0
      },
      {
        label: "Add Extra Work",
        description: "Capture variation work, change orders, amount increases, client approval, and billing status.",
        path: "/extra-works?add=1",
        keywords: "extra work variation change order increase amount additional work waterproofing pop electrical billing unbilled",
        rank: 0
      },
      {
        label: "Payment Recovery",
        description: "Open pending client payments, reminders, cashflow radar, and WhatsApp follow-up actions.",
        path: "/payment-recovery",
        keywords: "payment recovery collect money receivable reminder overdue pending whatsapp cashflow",
        rank: 0
      },
      {
        label: "Partner Money Taken",
        description: "Track Arbaz, Sahil, or partner withdrawals, profit sharing, emergency money, and owner draws.",
        path: "/partner-ledger",
        keywords: "partner draw ledger money taken company money arbaz sahil profit sharing emergency owner withdrawal advance cash ledger",
        rank: 0
      },
      {
        label: "Smart Daily Closing",
        description: "End the day with attendance, material, expenses, progress, payment follow-up, and a WhatsApp-ready report.",
        path: "/daily-closing",
        keywords: "daily closing day close checklist daily report site closing whatsapp report attendance material expense progress followup",
        rank: 0
      },
      {
        label: "AI Business Brain",
        description: "Open the smart control screen for cash, risk, approvals, partner money, and next best actions.",
        path: "/business-brain",
        keywords: "business brain ai control smart risk cash approval partner action decision intelligence",
        rank: 0
      },
      {
        label: "Cash Flow Forecast",
        description: "Forecast 7, 15, and 30 day cash pressure from pending client money, supplier dues, and daily burn.",
        path: "/cash-flow",
        keywords: "cash flow forecast money pressure pending supplier labour burn collection finance future",
        rank: 0
      },
      {
        label: "Approval Center",
        description: "Approve or reject partner draws, extra work, supplier dues, expenses, and risky decisions.",
        path: "/approval-center",
        keywords: "approval approve reject partner draw extra work supplier payment expense decision permission",
        rank: 0
      },
      {
        label: "Bill Scanner",
        description: "Scan supplier bill photos with OCR and save verified material or expense entries.",
        path: "/bill-scanner",
        keywords: "bill scanner scan ocr photo receipt supplier material expense invoice camera",
        rank: 0
      },
      {
        label: "Supabase Cloud Sync",
        description: "Check whether phone and laptop data is connected to Supabase and sync pending entries.",
        path: "/settings#supabase-sync",
        keywords: "supabase sync cloud online offline backup phone laptop database realtime",
        rank: 0
      },
      {
        label: "Daily Site Entry",
        description: "Start attendance, labour wages, materials, expenses, and progress updates for today.",
        path: "/attendance?add=1",
        keywords: "daily update labour wage wedges attendance present absent half day site entry",
        rank: 1
      }
    ].map((command) => ({
      ...command,
      id: `command-${command.path}-${command.label}`,
      icon: iconFor(command.path),
      type: "Action" as const
    }));

    const recordResults: SearchResult[] = searchTerm.length > 1
      ? [
          ...(sites.data || []).map((site) => ({
            id: `site-${site.id}`,
            label: site.name,
            description: `Site - ${site.client_name || "Client"} - ${site.status} - ${site.progress_percent}% progress`,
            path: recordPath("/sites", site.name),
            icon: iconFor("/sites"),
            keywords: `${site.name} ${site.client_name || ""} ${site.address || ""} ${site.work_type || ""} ${site.status}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchLabour.data || []).map((item) => ({
            id: `labour-${item.id}`,
            label: item.full_name,
            description: `Labour - ${item.work_type || "Worker"} - wage ${formatMoney(item.default_daily_wage)} - balance ${formatMoney(item.balance_payment)}`,
            path: recordPath("/labour", item.full_name),
            icon: iconFor("/labour"),
            keywords: `${item.full_name} ${item.mobile || ""} ${item.work_type || ""}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchMaterials.data || []).map((item) => ({
            id: `material-${item.id}`,
            label: item.material_name,
            description: `Material - ${item.quantity} ${item.unit} - ${formatMoney(item.total)} - ${item.supplier_name || "No supplier"}`,
            path: recordPath("/materials", item.material_name),
            icon: iconFor("/materials"),
            keywords: `${item.material_name} ${item.supplier_name || ""} ${item.bill_number || ""} ${item.unit}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchExpenses.data || []).map((item) => ({
            id: `expense-${item.id}`,
            label: `${item.category} expense`,
            description: `Expense - ${formatMoney(item.amount)} - ${item.date} - ${item.notes || "No notes"}`,
            path: recordPath("/expenses", item.category),
            icon: iconFor("/expenses"),
            keywords: `${item.category} ${item.amount} ${item.date} ${item.notes || ""}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchPayments.data || []).map((item) => ({
            id: `payment-${item.id}`,
            label: `Client payment ${formatMoney(item.received_amount)}`,
            description: `Payment - received ${formatMoney(item.received_amount)} - pending ${formatMoney(item.pending_amount)} - ${item.payment_date}`,
            path: recordPath("/payments", String(item.received_amount)),
            icon: iconFor("/payments"),
            keywords: `${item.received_amount} ${item.pending_amount} ${item.payment_date} ${item.payment_mode} ${item.notes || ""}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchSuppliers.data || []).map((item) => ({
            id: `supplier-${item.id}`,
            label: item.name,
            description: `Supplier - ${item.material_type || "General"} - ${item.mobile || "No mobile"}`,
            path: recordPath("/suppliers", item.name),
            icon: iconFor("/suppliers"),
            keywords: `${item.name} ${item.mobile || ""} ${item.material_type || ""}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchProgress.data || []).map((item) => ({
            id: `progress-${item.id}`,
            label: item.title,
            description: `Progress - ${item.progress_percent}% - ${item.date}`,
            path: recordPath("/progress", item.title),
            icon: iconFor("/progress"),
            keywords: `${item.title} ${item.description} ${item.date} ${item.progress_percent}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchExtraWorks.data || []).map((item) => ({
            id: `extra-${item.id}`,
            label: item.description,
            description: `Extra work - ${formatMoney(item.amount)} - ${item.status}`,
            path: recordPath("/extra-works", item.description),
            icon: iconFor("/extra-works"),
            keywords: `${item.work_type} ${item.description} ${item.status} ${item.amount}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          })),
          ...(searchPartnerDraws.data || []).map((item) => ({
            id: `draw-${item.id}`,
            label: item.partner_name,
            description: `Partner draw - ${formatMoney(item.amount)} - ${item.category} - ${item.date}`,
            path: recordPath("/partner-draws", item.partner_name),
            icon: iconFor("/partner-draws"),
            keywords: `${item.partner_name} ${item.amount} ${item.category} ${item.date} ${item.notes || ""}`.toLowerCase(),
            rank: 0,
            type: "Record" as const
          }))
        ]
      : [];

    const allResults: SearchResult[] = [...recordResults, ...commands, ...routeResults];
    if (!searchTerm) return allResults.slice(0, 18);
    return allResults
      .filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(searchTerm))
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
      .slice(0, 18);
  }, [
    searchTerm,
    sites.data,
    searchLabour.data,
    searchMaterials.data,
    searchExpenses.data,
    searchPayments.data,
    searchSuppliers.data,
    searchProgress.data,
    searchExtraWorks.data,
    searchPartnerDraws.data
  ]);

  const searchLoading =
    searchRecordsEnabled &&
    (searchLabour.isLoading ||
      searchMaterials.isLoading ||
      searchExpenses.isLoading ||
      searchPayments.isLoading ||
      searchSuppliers.isLoading ||
      searchProgress.isLoading ||
      searchExtraWorks.isLoading ||
      searchPartnerDraws.isLoading);

  const scrollToHash = (path: string) => {
    const hash = path.split("#")[1];
    if (!hash) {
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 80);
      return;
    }
    window.setTimeout(() => {
      if (window.location.hash !== `#${hash}`) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
      }
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 160);
  };

  const addSelectedSiteToPath = (path: string) => {
    if (!selectedSiteId || !path.includes("add=1") || path.includes("siteId=")) return path;
    const [baseWithQuery = path, hash] = path.split("#");
    const separator = baseWithQuery.includes("?") ? "&" : "?";
    return `${baseWithQuery}${separator}siteId=${encodeURIComponent(selectedSiteId)}${hash ? `#${hash}` : ""}`;
  };

  const go = (path: string) => {
    const nextPath = addSelectedSiteToPath(path);
    const now = Date.now();
    if (lastNavigationRef.current.path === nextPath && now - lastNavigationRef.current.at < 350) return;
    lastNavigationRef.current = { path: nextPath, at: now };
    setQuickOpen(false);
    setSearchOpen(false);
    setQuery("");
    router.push(nextPath, { scroll: false });
    scrollToHash(nextPath);
  };

  useEffect(() => {
    setQuickOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  return (
    <div className={styles.shellRoot} data-adaptive-density={hydrated ? adaptiveState.density : undefined} data-route-mode={hydrated ? adaptiveState.routeMode : undefined}>
        <header className={styles.appHeader}>
          <div className={styles.topBar}>
            <div className={styles.brandCluster}>
              <div className={styles.brandMark} aria-hidden="true">
                H&H
              </div>
              <div className={styles.titleBlock}>
                <p className={styles.eyebrow}>{company?.name || appName}</p>
                <h1 className={styles.title}>{title}</h1>
              </div>
            </div>
            <div className={styles.headerActions}>
                <button
                  className={styles.iconButton}
                  type="button"
                  aria-label="Search everything"
                  onClick={() => {
                    setQuery("");
                    setSearchOpen(true);
                  }}
                >
                <AppIcon icon={Search} />
              </button>
              <button className={styles.iconButton} type="button" aria-label="Toggle theme" onClick={toggleMode}>
                <AppIcon icon={mode === "dark" ? Sun : Moon} />
              </button>
            </div>
          </div>
          {!focusedToolRoute ? (
            <div className={styles.statusDock} aria-label="Business command shortcuts">
              <button type="button" onClick={() => go("/daily-closing")}>
                <span>Today</span>
              </button>
              <button type="button" onClick={() => go("/quick-entry")}>
                <span>Add Entry</span>
              </button>
              <button type="button" onClick={() => go("/settings#supabase-sync")}>
                <span suppressHydrationWarning>{hydrated ? syncStatus.label : "Sync Status"}</span>
              </button>
            </div>
          ) : null}
        </header>

        <div className={styles.page}>
          <main className={styles.content}>
            {subtitle ? <p className={styles.sheetSub}>{subtitle}</p> : null}
            {!focusedToolRoute ? (
              <div className={styles.siteDock} aria-label="Current site selector">
                <div className={styles.siteDockText}>
                  <span>Site</span>
                  <strong>{selectedSite ? selectedSite.name : "All Sites"}</strong>
                </div>
                <select aria-label="Select current site" value={selectedSiteId} onChange={(event) => setSelectedSiteId(event.target.value)}>
                  <option value="">All Active Sites</option>
                  {activeSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} - {site.client_name || "Client"}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {hydrated && adaptiveMode && !focusedToolRoute ? (
              <button
                className={`${styles.adaptiveStrip} ${
                  adaptiveState.command.severity === "critical" ? styles.adaptiveCritical : adaptiveState.command.severity === "warning" ? styles.adaptiveWarning : ""
                }`}
                type="button"
                data-testid="adaptive-strip"
                onClick={() => go(adaptiveState.command.route)}
              >
                <span>Adaptive Mode</span>
                <strong>{adaptiveState.command.title}</strong>
                <small>{adaptiveState.command.detail}</small>
                <em>{adaptiveState.command.actionLabel}</em>
              </button>
            ) : null}
            {hydrated && offlineMode && !pathname.startsWith("/settings") ? <SyncStatusCard compact /> : null}
            <div>{children}</div>
          </main>
        </div>

        {showAiButton ? (
          <button className={styles.aiButton} type="button" data-testid="ask-ai-button" onClick={() => router.push(aiRoute)}>
            <AppIcon icon={Sparkles} />
            <span>Ask AI</span>
          </button>
        ) : null}

        <nav className={styles.bottomNav} aria-label="Main navigation">
          {mainTabs.map((route) => (
            <button
              key={route.path}
              className={`${styles.navButton} ${
                pathname === route.path || (route.path !== "/dashboard" && pathname.startsWith(route.path)) ? styles.navButtonActive : ""
              }`}
              type="button"
              onClick={() => go(route.path)}
            >
              <AppIcon icon={route.icon} />
              <span className={styles.navIconLabel}>{route.label}</span>
            </button>
          ))}
        </nav>

        {showQuickAdd ? (
          <button className={styles.addButton} type="button" data-testid="quick-add-button" aria-label="Open quick add" onClick={() => setQuickOpen(true)}>
            <AppIcon icon={CirclePlus} />
            <span>Add</span>
          </button>
        ) : null}

        {quickOpen ? (
          <div className={styles.sheetOverlay} role="dialog" aria-modal="true" aria-label="Quick Add">
            <button className={styles.sheetBackdrop} type="button" aria-label="Close quick add" onClick={() => setQuickOpen(false)} />
            <div className={styles.quickSheet}>
            <div className={styles.sheetHandle} />
            <h2 className={styles.sheetTitle}>Quick Add</h2>
            <p className={styles.sheetSub}>Add today&apos;s site work without opening five different screens.</p>
            {quickActionGroups.map((group) => (
              <section className={styles.quickSection} key={group.title}>
                <h3>{group.title}</h3>
                <div className={styles.quickGrid}>
                  {group.actions.map((action) => (
                    <button key={action.path} className={styles.quickCard} type="button" onClick={() => go(action.path)}>
                      <AppIcon icon={action.icon} />
                      <span>
                        <strong>{action.label}</strong>
                        <small>{action.helper}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <button className={styles.sheetClose} type="button" onClick={() => setQuickOpen(false)}>
              Close
            </button>
          </div>
          </div>
        ) : null}

        {searchOpen ? (
          <div className={styles.sheetOverlay} role="dialog" aria-modal="true" aria-label="Search Everything">
            <button className={styles.sheetBackdrop} type="button" aria-label="Dismiss search overlay" onClick={() => setSearchOpen(false)} />
            <div className={styles.searchSheet}>
            <div className={styles.sheetHandle} />
            <h2 className={styles.sheetTitle}>Search Everything</h2>
            <p className={styles.sheetSub}>Search daily actions, money records, reports, bill scanner, Supabase sync, and advanced tools.</p>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search any feature"
              style={{
                width: "100%",
                minHeight: 54,
                borderRadius: 18,
                border: "1px solid var(--app-border)",
                padding: "0 14px",
                background: "var(--app-surface)",
                color: "var(--app-text)",
                marginBottom: 14
              }}
            />
            <div className={styles.searchList}>
              {searchLoading ? <Skeleton style={{ height: 72 }} /> : null}
              {searchResults.map((route) => (
                <button key={route.id} className={styles.searchItem} type="button" onClick={() => go(route.path)}>
                  <AppIcon icon={route.icon} />
                  <span>
                    <strong>{route.label}</strong>
                    <small>{route.type}</small>
                    <p>{route.description}</p>
                  </span>
                </button>
              ))}
              {!searchLoading && searchResults.length === 0 ? (
                <div className={styles.searchEmpty}>
                  <strong>No matching result</strong>
                  <p>Try site name, labour name, material, supplier, bill number, payment, report, or tool name.</p>
                </div>
              ) : null}
            </div>
            <button className={styles.sheetClose} type="button" onClick={() => setSearchOpen(false)}>
              Close Search
            </button>
          </div>
          </div>
        ) : null}
    </div>
  );
}
