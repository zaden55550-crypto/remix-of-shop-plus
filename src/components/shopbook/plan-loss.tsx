// Tells people what a plan leaves out, before it surprises them: when starting the trial, on the payment page and as the trial ends.
// The list comes from each app's tier in shopbook.ts, so it can't drift from what really locks.
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Download, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { useBackupStatus } from "@/lib/cloud-backup";
import { downloadMyRecords } from "@/lib/records-export";
import {
  PLANS,
  TRIAL_WARNING_DAYS,
  appsNotIn,
  planAllowanceLines,
  store,
  type PlanId,
} from "@/lib/shopbook";
import { cn } from "@/lib/utils";

/** "Basic does not include: Contacts, Float…" with the plan's location and login allowance. */
export function PlanLoss({
  planId,
  apps = appsNotIn(planId),
}: {
  planId: PlanId;
  apps?: { id: string; name: string }[];
}) {
  const { tr } = useLanguage();
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return null;
  if (!apps.length)
    return <p className="plan-loss-title">{tr("{x} includes every app.", plan.name)}</p>;
  return (
    <div className="plan-loss">
      <p className="plan-loss-title">{tr("{x} does not include:", plan.name)}</p>
      <ul className="plan-loss-apps">
        {apps.map((app) => (
          <li key={app.id}>
            <Lock aria-hidden="true" />
            {tr(app.name)}
          </li>
        ))}
      </ul>
      <p className="plan-loss-limit">
        {tr("{x} allows:", plan.name)} {tr(planAllowanceLines(plan)[0]!)}
      </p>
    </div>
  );
}

/** A readable copy of every record, on every plan. Without a current cloud copy, the owner is told the records are only on this device. */
export function DownloadRecords() {
  const { tr } = useLanguage();
  const backup = useBackupStatus();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      await downloadMyRecords(store.get()?.shopName ?? "shop");
      toast.success(tr("Export downloaded"));
    } catch {
      toast.error(tr("Download failed. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="plan-records">
      {backup.phase !== "backed" && backup.phase !== "syncing" && (
        <p className="plan-records-note">{tr("Your data is only on this device. Download a copy to keep it safe.")}</p>
      )}
      <ShopButton variant="outline" className="h-auto min-h-10 px-3 py-2 text-sm" disabled={busy} onClick={download}>
        <Download className="h-4 w-4" />
        {tr("Download my records (Excel)")}
      </ShopButton>
    </div>
  );
}

/** A small floating message over any screen. It sits on body because a parent's blur or zoom would trap a fixed pop-up. */
export function GlassNotice({
  title,
  onClose,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const { tr, dir } = useLanguage();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="glass-scrim fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        dir={dir}
        className={cn(
          "glass-card relative w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("Close")}
          className="absolute end-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="pe-8 text-base font-bold">{title}</h2>
        <div className="mt-2 space-y-2 text-sm">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const SEEN_KEY = "shopbook.trialNotice";

/** Once a day in the trial's last days, the owner sees what they will lose. Employees don't: the subscription isn't theirs. */
export function TrialEndingNotice({ days }: { days: number }) {
  const { tr } = useLanguage();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PlanId | undefined>();

  useEffect(() => {
    const acct = store.get();
    if (acct?.plan !== "trial" || acct.staff || days < 1 || days > TRIAL_WARNING_DAYS) return;
    const today = new Date().toDateString();
    if (localStorage.getItem(SEEN_KEY) === today) return;
    localStorage.setItem(SEEN_KEY, today);
    setChoice(acct.trialChoice);
    setOpen(true);
  }, [days]);

  if (!open) return null;
  const close = () => setOpen(false);
  // Anyone who started before plans could be selected sees both smaller plans.
  const plans: PlanId[] = choice ? [choice] : ["basic", "growth"];
  return (
    <GlassNotice
      title={`${tr("Your free trial")}: ${tr(days === 1 ? "{x} day left" : "{x} days left", days)}`}
      onClose={close}
    >
      <p>{tr("After your 30-day trial ends, you can still view and export your existing records. Subscribe to add new transactions.")}</p>
      {plans.map((id) => (
        <PlanLoss key={id} planId={id} />
      ))}
      <p>{tr("Your records stay safe. Upgrading opens them again.")}</p>
      {plans.some((id) => appsNotIn(id).length > 0) && (
        <p>{tr("Save or print anything you need from these apps before the trial ends.")}</p>
      )}
      <DownloadRecords />
      <ShopButton
        className="h-11 text-sm"
        onClick={() => {
          close();
          nav({ to: "/plans" });
        }}
      >
        {tr("Explore plans")}
      </ShopButton>
    </GlassNotice>
  );
}
