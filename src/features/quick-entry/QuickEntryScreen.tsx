"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AppIcon } from "@/components/ui/app-icon";
import { quickActionGroups } from "@/config/routes";
import { useAuth } from "@/lib/auth";
import { useRecords } from "@/lib/repository";
import { selectedSiteStorageKey, useUiStore } from "@/lib/ui-store";
import { automationEngine } from "@/utils/automation-engine";
import { dashboardMetrics } from "@/utils/calc";
import { formatMoney, todayIso } from "@/utils/format";
import styles from "./QuickEntry.module.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

function statusTone(done: boolean) {
  return done ? "success" : "warning";
}

function normalizeRoutePath(path: string) {
  const [pathWithoutHash = "/", hash] = path.split("#");
  const [route = "/", query] = pathWithoutHash.split("?");
  const normalizedRoute = route !== "/" && !route.endsWith("/") ? `${route}/` : route;
  return `${normalizedRoute}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

function withSite(path: string, siteId: string) {
  const normalized = normalizeRoutePath(path);
  const currentSiteId = siteId || (typeof window === "undefined" ? "" : window.localStorage.getItem(selectedSiteStorageKey) || "");
  if (!currentSiteId || !normalized.includes("add=1") || normalized.includes("siteId=")) return normalized;
  const separator = normalized.includes("?") ? "&" : "?";
  return `${normalized}${separator}siteId=${encodeURIComponent(currentSiteId)}`;
}

export function QuickEntryScreen() {
  const router = useRouter();
  const { company } = useAuth();
  const selectedSiteId = useUiStore((state) => state.selectedSiteId);
  const lastNavigationRef = useRef({ path: "", at: 0 });
  const today = todayIso();

  const sites = useRecords("sites", company?.id);
  const labour = useRecords("labour", company?.id);
  const attendance = useRecords("attendance", company?.id);
  const materials = useRecords("materials", company?.id);
  const expenses = useRecords("expenses", company?.id);
  const payments = useRecords("client_payments", company?.id);
  const supplierPayments = useRecords("supplier_payments", company?.id);
  const partnerDraws = useRecords("partner_draws", company?.id);
  const progress = useRecords("progress_updates", company?.id);
  const extraWorks = useRecords("extra_works", company?.id);
  const reminders = useRecords("reminders", company?.id);

  const selectedSite = useMemo(() => (sites.data || []).find((site) => site.id === selectedSiteId) || null, [selectedSiteId, sites.data]);
  const siteMatch = useCallback((siteId: string | null | undefined) => !selectedSiteId || siteId === selectedSiteId, [selectedSiteId]);
  const go = (path: string) => {
    const target = withSite(path, selectedSiteId);
    const now = Date.now();
    if (lastNavigationRef.current.path === target && now - lastNavigationRef.current.at < 350) return;
    lastNavigationRef.current = { path: target, at: now };
    router.push(target);
    if (typeof window === "undefined" || !target.includes("add=1")) return;
    window.setTimeout(() => {
      if (window.location.pathname.endsWith("/quick-entry") || window.location.pathname.endsWith("/quick-entry/")) {
        window.location.assign(`${basePath}${target}`);
      }
    }, 140);
  };

  const metrics = useMemo(
    () =>
      dashboardMetrics({
        sites: selectedSiteId ? (sites.data || []).filter((site) => site.id === selectedSiteId) : sites.data || [],
        attendance: (attendance.data || []).filter((item) => siteMatch(item.site_id)),
        materials: (materials.data || []).filter((item) => siteMatch(item.site_id)),
        expenses: (expenses.data || []).filter((item) => siteMatch(item.site_id)),
        payments: (payments.data || []).filter((item) => siteMatch(item.site_id)),
        supplierPayments: (supplierPayments.data || []).filter((item) => siteMatch(item.site_id)),
        labour: selectedSiteId ? (labour.data || []).filter((item) => item.site_id === selectedSiteId) : labour.data || [],
        extraWorks: (extraWorks.data || []).filter((item) => siteMatch(item.site_id)),
        partnerDraws: (partnerDraws.data || []).filter((item) => siteMatch(item.site_id))
      }),
    [
      attendance.data,
      expenses.data,
      extraWorks.data,
      labour.data,
      materials.data,
      partnerDraws.data,
      payments.data,
      selectedSiteId,
      siteMatch,
      sites.data,
      supplierPayments.data
    ]
  );

  const engine = useMemo(
    () =>
      automationEngine({
        sites: selectedSiteId ? (sites.data || []).filter((site) => site.id === selectedSiteId) : sites.data || [],
        labour: selectedSiteId ? (labour.data || []).filter((item) => item.site_id === selectedSiteId) : labour.data || [],
        attendance: (attendance.data || []).filter((item) => siteMatch(item.site_id)),
        materials: (materials.data || []).filter((item) => siteMatch(item.site_id)),
        expenses: (expenses.data || []).filter((item) => siteMatch(item.site_id)),
        payments: (payments.data || []).filter((item) => siteMatch(item.site_id)),
        supplierPayments: (supplierPayments.data || []).filter((item) => siteMatch(item.site_id)),
        progress: (progress.data || []).filter((item) => siteMatch(item.site_id)),
        extraWorks: (extraWorks.data || []).filter((item) => siteMatch(item.site_id)),
        reminders: (reminders.data || []).filter((item) => siteMatch(item.site_id))
      }),
    [
      attendance.data,
      expenses.data,
      extraWorks.data,
      labour.data,
      materials.data,
      payments.data,
      progress.data,
      reminders.data,
      selectedSiteId,
      siteMatch,
      sites.data,
      supplierPayments.data
    ]
  );

  const todayStatus = [
    {
      label: "Attendance",
      done: (attendance.data || []).some((item) => item.date === today && siteMatch(item.site_id)),
      path: "/attendance?add=1"
    },
    {
      label: "Material",
      done: (materials.data || []).some((item) => item.date === today && siteMatch(item.site_id)),
      path: "/materials?add=1"
    },
    {
      label: "Expense",
      done: (expenses.data || []).some((item) => item.date === today && siteMatch(item.site_id)),
      path: "/expenses?add=1"
    },
    {
      label: "Progress",
      done: (progress.data || []).some((item) => item.date === today && siteMatch(item.site_id)),
      path: "/progress?add=1"
    }
  ];

  const doneCount = todayStatus.filter((item) => item.done).length;

  return (
    <section className={styles.stack}>
      <div className={styles.hero}>
        <span>Daily Add</span>
        <h2>{doneCount}/4</h2>
        <p>{selectedSite ? `${selectedSite.name}: ` : ""}Add attendance, expense, material, payment, progress, or extra work in one place.</p>
        <div className={styles.heroActions}>
          <Button onClick={() => go("/attendance?add=1")}>Start Attendance</Button>
          <Button variant="secondary" onClick={() => go("/expenses?add=1")}>Add Expense</Button>
        </div>
      </div>

      <div className={styles.statusGrid}>
        {todayStatus.map((item) => (
          <button className={styles.statusCard} type="button" key={item.label} onClick={() => go(item.path)}>
            <span>{item.label}</span>
            <strong>{item.done ? "Done" : "Add"}</strong>
            <Badge tone={statusTone(item.done)}>{item.done ? "Saved" : "Open"}</Badge>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader title="Fast Money View" subtitle="The three numbers you usually need before taking action." />
        <div className={styles.moneyGrid}>
          <button type="button" onClick={() => go("/payment-recovery")}>
            <span>Client Pending</span>
            <strong>{formatMoney(metrics.pendingClientPayments)}</strong>
          </button>
          <button type="button" onClick={() => go("/supplier-payments")}>
            <span>Supplier Pending</span>
            <strong>{formatMoney(metrics.pendingSupplierPayments)}</strong>
          </button>
          <button type="button" onClick={() => go("/partner-ledger")}>
            <span>Partner Draws</span>
            <strong>{formatMoney(metrics.partnerDrawsTotal)}</strong>
          </button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Suggested Next" subtitle="Calculated from missing entries, pending money, site risk, and reminders." />
        {engine.actions.length ? (
          <div className={styles.suggestionList}>
            {engine.actions.slice(0, 4).map((action) => (
              <button className={styles.suggestion} type="button" key={action.id} onClick={() => go(action.route)}>
                <span>{action.category}</span>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title="No urgent action" description="Your quick suggestions will appear here when something needs attention." />
        )}
      </Card>

      {quickActionGroups.map((group) => (
        <Card key={group.title}>
          <CardHeader title={group.title} subtitle="Tap any card to open the correct entry screen." />
          <div className={styles.quickGrid}>
            {group.actions.map((action) => (
              <button className={styles.quickCard} type="button" key={action.path} onClick={() => go(action.path)}>
                <AppIcon icon={action.icon} />
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.helper}</small>
                </span>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </section>
  );
}
