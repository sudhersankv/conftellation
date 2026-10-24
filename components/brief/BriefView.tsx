"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Moon, RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import { apiKey, useApi } from "@/lib/ui/use-api";
import { useSession } from "@/lib/ui/session-context";
import { fmtDay } from "@/lib/ui/format";
import { Button, Card, Chip, EmptyState, ErrorState, PageHeader, SectionHeader, Segmented, Skeleton, StatusLine, buttonClass } from "@/components/ui";
import { IntroCard } from "@/components/network/IntroCard";
import { BriefSections } from "./BriefLines";
import { TripReport } from "./TripReport";

type Tab = "brief" | "trip";

export function BriefView() {
  const { userId, confId } = useSession();
  const [tab, setTab] = useState<Tab>("brief");
  const [regen, setRegen] = useState(false);
  const brief = useApi(apiKey("brief", userId, confId), () => api.brief(userId, confId));
  const intros = useApi(apiKey("intros", userId, confId), () => api.intros(userId, confId));

  const regenerate = async () => {
    setRegen(true);
    try {
      const prev = brief.data?.generatedAt;
      const next = await api.brief(userId, confId, { regenerate: true });
      brief.mutate(next);
      if (prev && next.generatedAt === prev) toast("No change");
      else toast.success("Brief rewritten from today's paths");
    } catch (e) {
      toast.error(`Couldn't regenerate: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRegen(false);
    }
  };

  const sections = (brief.data?.sections ?? []).filter((s) => s.lines.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tonight's brief"
        subtitle={
          brief.data ? (
            <span className="flex flex-wrap items-center gap-2">
              <span suppressHydrationWarning>{fmtDay(brief.data.generatedAt)}</span>
              {brief.data.precomputed && <Chip kind="status">Prepared earlier</Chip>}
            </span>
          ) : "What today added to your graph"
        }
        actions={tab === "brief" && (
          <Button variant="secondary" size="sm" onClick={regenerate} loading={regen} disabled={!brief.data && !brief.error}>
            {!regen && <RefreshCw className="size-3.5" aria-hidden />}Regenerate
          </Button>
        )}
      />

      <Segmented value={tab} onChange={setTab} options={[{ value: "brief", label: "Brief" }, { value: "trip", label: "Trip report" }]} className="self-start" />

      {tab === "brief" ? (
        <>
          {regen && (
            <Card className="flex items-center gap-3 bg-[#FFF3C4]">
              <RefreshCw className="size-4 animate-spin text-text" aria-hidden />
              <StatusLine className="text-text">Recapper is reading your day&apos;s paths…</StatusLine>
            </Card>
          )}
          {brief.error && !brief.data ? (
            <ErrorState what="your brief" detail={brief.error.message} onRetry={brief.reload} />
          ) : !brief.data ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton rows={2} rowClassName="h-6" /></Card>)}
            </div>
          ) : sections.length === 0 ? (
            <EmptyState
              icon={<Moon className="size-5" />}
              title="Nothing captured yet"
              text="Check in to sessions and add notes. Tonight's brief is written from what you capture."
              action={<Link href="/plan" className={buttonClass({ variant: "secondary", size: "sm" })}>Open plan</Link>}
            />
          ) : (
            <div className={regen ? "opacity-50 transition-opacity" : "transition-opacity"}>
              <BriefSections sections={sections} paths={brief.data.paths} confId={confId} />
              <StatusLine className="mt-3">Tap a line to see its path in the graph.</StatusLine>
            </div>
          )}
        </>
      ) : (
        <TripReport userId={userId} confId={confId} />
      )}

      <section className="mt-2">
        <SectionHeader title="Seen before / warm intros" count={intros.data?.intros.length} />
        {intros.error && !intros.data ? (
          <ErrorState what="intros" detail={intros.error.message} onRetry={intros.reload} />
        ) : !intros.data ? (
          <Skeleton rows={2} rowClassName="h-16" />
        ) : intros.data.intros.length === 0 ? (
          <EmptyState text="No one from past conferences crossed your path today." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {intros.data.intros.map((i, k) => <IntroCard key={`${i.kind}-${i.person.id}-${k}`} intro={i} confId={confId} compact />)}
          </div>
        )}
      </section>
    </div>
  );
}
