import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichVerfuegbarkeit, enrichSchichtzuweisungen } from '@/lib/enrich';
import type { EnrichedVerfuegbarkeit, EnrichedSchichtzuweisungen } from '@/types/enriched';
import type { Schichtzuweisungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SchichtzuweisungenDialog } from '@/components/dialogs/SchichtzuweisungenDialog';
import { VerfuegbarkeitDialog } from '@/components/dialogs/VerfuegbarkeitDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  IconAlertCircle, IconTool, IconRefresh, IconCheck,
  IconChevronLeft, IconChevronRight, IconPlus, IconPencil,
  IconTrash, IconUsers, IconCalendar, IconClock, IconShield,
} from '@tabler/icons-react';
import { addDays, startOfWeek, format, isSameDay, parseISO, isToday } from 'date-fns';
import { de } from 'date-fns/locale';

const APPGROUP_ID = '69ef63a63f82459e8f09be49';
const REPAIR_ENDPOINT = '/claude/build/repair';

// Availability status colors
const statusColor: Record<string, string> = {
  verfuegbar: 'bg-emerald-500',
  eingeschraenkt_verfuegbar: 'bg-amber-400',
  nicht_verfuegbar: 'bg-rose-500',
};

const statusBg: Record<string, string> = {
  verfuegbar: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  eingeschraenkt_verfuegbar: 'bg-amber-50 text-amber-700 border-amber-200',
  nicht_verfuegbar: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function DashboardOverview() {
  const {
    mitarbeiter, schichtvorlagen, verfuegbarkeit, schichtzuweisungen,
    mitarbeiterMap, schichtvorlagenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedVerfuegbarkeit = enrichVerfuegbarkeit(verfuegbarkeit, { mitarbeiterMap });
  const enrichedSchichtzuweisungen = enrichSchichtzuweisungen(schichtzuweisungen, { mitarbeiterMap, schichtvorlagenMap });

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeTab, setActiveTab] = useState<'schichten' | 'verfuegbarkeit'>('schichten');

  // Dialog state — Schichtzuweisungen
  const [schichtDialog, setSchichtDialog] = useState(false);
  const [editSchicht, setEditSchicht] = useState<EnrichedSchichtzuweisungen | null>(null);
  const [prefillSchichtDate, setPrefillSchichtDate] = useState<string | null>(null);
  const [prefillMitarbeiterId, setPrefillMitarbeiterId] = useState<string | null>(null);
  const [deleteSchicht, setDeleteSchicht] = useState<EnrichedSchichtzuweisungen | null>(null);

  // Dialog state — Verfügbarkeit
  const [verfDialog, setVerfDialog] = useState(false);
  const [editVerf, setEditVerf] = useState<EnrichedVerfuegbarkeit | null>(null);
  const [deleteVerf, setDeleteVerf] = useState<EnrichedVerfuegbarkeit | null>(null);

  // Week dates
  const weekDates = useMemo(() => {
    const monday = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [weekOffset]);

  // Index data by date
  const schichtenByDate = useMemo(() => {
    const map: Record<string, EnrichedSchichtzuweisungen[]> = {};
    for (const s of enrichedSchichtzuweisungen) {
      if (!s.fields.datum) continue;
      const day = s.fields.datum.slice(0, 10);
      if (!map[day]) map[day] = [];
      map[day].push(s);
    }
    return map;
  }, [enrichedSchichtzuweisungen]);

  const verfByDateAndMitarbeiter = useMemo(() => {
    const map: Record<string, Record<string, EnrichedVerfuegbarkeit>> = {};
    for (const v of enrichedVerfuegbarkeit) {
      if (!v.fields.datum) continue;
      const day = v.fields.datum.slice(0, 10);
      const mid = v.mitarbeiterName;
      if (!map[day]) map[day] = {};
      map[day][mid] = v;
    }
    return map;
  }, [enrichedVerfuegbarkeit]);

  // KPIs
  const weekDateStrings = weekDates.map(d => format(d, 'yyyy-MM-dd'));
  const schichtenThisWeek = enrichedSchichtzuweisungen.filter(s =>
    s.fields.datum && weekDateStrings.includes(s.fields.datum.slice(0, 10))
  );
  const verfThisWeek = enrichedVerfuegbarkeit.filter(v =>
    v.fields.datum && weekDateStrings.includes(v.fields.datum.slice(0, 10))
  );
  const verfuegbarCount = verfThisWeek.filter(v => v.fields.verfuegbarkeitsstatus?.key === 'verfuegbar').length;

  // Handlers — Schichtzuweisungen
  const openCreateSchicht = (date: Date, mitarbeiterId?: string) => {
    setEditSchicht(null);
    setPrefillSchichtDate(format(date, "yyyy-MM-dd'T'08:00"));
    setPrefillMitarbeiterId(mitarbeiterId ?? null);
    setSchichtDialog(true);
  };
  const openEditSchicht = (s: EnrichedSchichtzuweisungen) => {
    setEditSchicht(s);
    setPrefillSchichtDate(null);
    setPrefillMitarbeiterId(null);
    setSchichtDialog(true);
  };
  const handleSchichtSubmit = async (fields: Schichtzuweisungen['fields']) => {
    if (editSchicht) {
      await LivingAppsService.updateSchichtzuweisungenEntry(editSchicht.record_id, fields);
    } else {
      await LivingAppsService.createSchichtzuweisungenEntry(fields);
    }
    fetchAll();
  };
  const handleDeleteSchicht = async () => {
    if (!deleteSchicht) return;
    await LivingAppsService.deleteSchichtzuweisungenEntry(deleteSchicht.record_id);
    setDeleteSchicht(null);
    fetchAll();
  };

  // Handlers — Verfügbarkeit
  const openCreateVerf = () => {
    setEditVerf(null);
    setVerfDialog(true);
  };
  const openEditVerf = (v: EnrichedVerfuegbarkeit) => {
    setEditVerf(v);
    setVerfDialog(true);
  };
  const handleVerfSubmit = async (fields: EnrichedVerfuegbarkeit['fields']) => {
    if (editVerf) {
      await LivingAppsService.updateVerfuegbarkeitEntry(editVerf.record_id, fields);
    } else {
      await LivingAppsService.createVerfuegbarkeitEntry(fields);
    }
    fetchAll();
  };
  const handleDeleteVerf = async () => {
    if (!deleteVerf) return;
    await LivingAppsService.deleteVerfuegbarkeitEntry(deleteVerf.record_id);
    setDeleteVerf(null);
    fetchAll();
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const schichtDefaultValues = editSchicht
    ? editSchicht.fields
    : prefillSchichtDate
      ? {
          datum: prefillSchichtDate,
          ...(prefillMitarbeiterId
            ? { mitarbeiter: createRecordUrl(APP_IDS.MITARBEITER, prefillMitarbeiterId) }
            : {}),
        }
      : undefined;

  return (
    <div className="space-y-6 pb-8">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          title="Mitarbeiter"
          value={String(mitarbeiter.length)}
          description="Gesamt im System"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Schichten (Woche)"
          value={String(schichtenThisWeek.length)}
          description="Aktuelle Woche"
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Schichtvorlagen"
          value={String(schichtvorlagen.length)}
          description="Verfügbare Vorlagen"
          icon={<IconClock size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Verfügbar (Woche)"
          value={String(verfuegbarCount)}
          description="Meldungen diese Woche"
          icon={<IconShield size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Week Planner */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <IconChevronLeft size={18} />
            </button>
            <span className="font-semibold text-sm sm:text-base">
              {format(weekDates[0], 'd. MMM', { locale: de })} – {format(weekDates[6], 'd. MMM yyyy', { locale: de })}
            </span>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <IconChevronRight size={18} />
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
            >
              Heute
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setActiveTab('schichten')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'schichten' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                Schichten
              </button>
              <button
                onClick={() => setActiveTab('verfuegbarkeit')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'verfuegbarkeit' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                Verfügbarkeit
              </button>
            </div>
            {activeTab === 'schichten' && (
              <Button size="sm" onClick={() => openCreateSchicht(new Date())}>
                <IconPlus size={14} className="mr-1 shrink-0" />
                <span className="hidden sm:inline">Schicht</span>
              </Button>
            )}
            {activeTab === 'verfuegbarkeit' && (
              <Button size="sm" onClick={openCreateVerf}>
                <IconPlus size={14} className="mr-1 shrink-0" />
                <span className="hidden sm:inline">Verfügbarkeit</span>
              </Button>
            )}
          </div>
        </div>

        {/* Calendar grid — desktop */}
        <div className="hidden md:block overflow-x-auto">
          {activeTab === 'schichten' ? (
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  {weekDates.map(d => (
                    <th
                      key={d.toISOString()}
                      className={`border-b border-r last:border-r-0 px-2 py-2 text-center text-xs font-semibold ${isToday(d) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                    >
                      <div>{format(d, 'EEE', { locale: de })}</div>
                      <div className={`text-lg font-bold mt-0.5 ${isToday(d) ? 'text-primary' : 'text-foreground'}`}>
                        {format(d, 'd')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {weekDates.map(d => {
                    const dayStr = format(d, 'yyyy-MM-dd');
                    const daySchichten = schichtenByDate[dayStr] ?? [];
                    return (
                      <td
                        key={d.toISOString()}
                        className={`border-r last:border-r-0 align-top p-2 min-h-[140px] ${isToday(d) ? 'bg-primary/5' : ''}`}
                      >
                        <div className="space-y-1.5 min-h-[120px]">
                          {daySchichten.map(s => (
                            <div
                              key={s.record_id}
                              className="rounded-lg bg-primary/10 border border-primary/20 px-2 py-1.5 group"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-primary truncate">{s.mitarbeiterName || '—'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{s.schichtvorlageName || '—'}</p>
                                  {s.fields.datum && (
                                    <p className="text-xs text-muted-foreground">{s.fields.datum.slice(11, 16)} Uhr</p>
                                  )}
                                </div>
                                <div className="flex gap-0.5 shrink-0">
                                  <button
                                    onClick={() => openEditSchicht(s)}
                                    className="p-1 rounded hover:bg-primary/20 transition-colors"
                                  >
                                    <IconPencil size={12} />
                                  </button>
                                  <button
                                    onClick={() => setDeleteSchicht(s)}
                                    className="p-1 rounded hover:bg-destructive/20 transition-colors"
                                  >
                                    <IconTrash size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => openCreateSchicht(d)}
                            className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors text-xs"
                          >
                            <IconPlus size={12} />
                            Hinzufügen
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          ) : (
            /* Verfügbarkeit grid: rows = employees, cols = days */
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-r px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-40">Mitarbeiter</th>
                    {weekDates.map(d => (
                      <th
                        key={d.toISOString()}
                        className={`border-b border-r last:border-r-0 px-2 py-2 text-center text-xs font-semibold ${isToday(d) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                      >
                        <div>{format(d, 'EEE', { locale: de })}</div>
                        <div className={`text-lg font-bold mt-0.5 ${isToday(d) ? 'text-primary' : 'text-foreground'}`}>
                          {format(d, 'd')}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mitarbeiter.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        Keine Mitarbeiter vorhanden.
                      </td>
                    </tr>
                  ) : mitarbeiter.map(m => (
                    <tr key={m.record_id} className="hover:bg-muted/20 transition-colors">
                      <td className="border-b border-r px-3 py-2">
                        <p className="text-sm font-medium truncate">{m.fields.vorname} {m.fields.nachname}</p>
                        {m.fields.personalnummer && (
                          <p className="text-xs text-muted-foreground">{m.fields.personalnummer}</p>
                        )}
                      </td>
                      {weekDates.map(d => {
                        const dayStr = format(d, 'yyyy-MM-dd');
                        const fullName = `${m.fields.vorname ?? ''} ${m.fields.nachname ?? ''}`.trim();
                        const vEntry = verfByDateAndMitarbeiter[dayStr]?.[fullName];
                        const statusKey = vEntry?.fields.verfuegbarkeitsstatus?.key;
                        return (
                          <td
                            key={d.toISOString()}
                            className={`border-b border-r last:border-r-0 px-1 py-1.5 text-center ${isToday(d) ? 'bg-primary/5' : ''}`}
                          >
                            {vEntry ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${statusBg[statusKey ?? ''] ?? 'bg-muted text-muted-foreground border-border'}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full mr-1 shrink-0 ${statusColor[statusKey ?? ''] ?? 'bg-muted-foreground'}`} />
                                  {vEntry.fields.verfuegbarkeitsstatus?.label?.split(' ')[0] ?? '—'}
                                </span>
                                <div className="flex gap-0.5">
                                  <button
                                    onClick={() => openEditVerf(vEntry)}
                                    className="p-0.5 rounded hover:bg-muted transition-colors"
                                  >
                                    <IconPencil size={11} />
                                  </button>
                                  <button
                                    onClick={() => setDeleteVerf(vEntry)}
                                    className="p-0.5 rounded hover:bg-destructive/10 transition-colors"
                                  >
                                    <IconTrash size={11} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setEditVerf(null);
                                  setVerfDialog(true);
                                }}
                                className="w-full h-8 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 rounded transition-colors"
                                title="Verfügbarkeit eintragen"
                              >
                                <IconPlus size={12} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Mobile: vertical day list */}
        <div className="md:hidden">
          {weekDates.map(d => {
            const dayStr = format(d, 'yyyy-MM-dd');
            const daySchichten = schichtenByDate[dayStr] ?? [];
            return (
              <div key={d.toISOString()} className={`border-b last:border-b-0 ${isToday(d) ? 'bg-primary/5' : ''}`}>
                <div className={`flex items-center justify-between px-4 py-2 ${isToday(d) ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                  <span className="text-sm font-semibold">
                    {format(d, 'EEEE, d. MMMM', { locale: de })}
                  </span>
                  {activeTab === 'schichten' && (
                    <button
                      onClick={() => openCreateSchicht(d)}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <IconPlus size={13} /> Schicht
                    </button>
                  )}
                </div>
                {activeTab === 'schichten' && (
                  <div className="px-4 pb-3 space-y-2">
                    {daySchichten.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Keine Schichten</p>
                    ) : daySchichten.map(s => (
                      <div key={s.record_id} className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-primary truncate">{s.mitarbeiterName || '—'}</p>
                          <p className="text-xs text-muted-foreground">{s.schichtvorlageName} {s.fields.datum ? `· ${s.fields.datum.slice(11, 16)} Uhr` : ''}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => openEditSchicht(s)} className="p-1.5 rounded hover:bg-primary/20 transition-colors">
                            <IconPencil size={14} />
                          </button>
                          <button onClick={() => setDeleteSchicht(s)} className="p-1.5 rounded hover:bg-destructive/20 transition-colors">
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {activeTab === 'verfuegbarkeit' && (
                  <div className="px-4 pb-3">
                    {mitarbeiter.map(m => {
                      const fullName = `${m.fields.vorname ?? ''} ${m.fields.nachname ?? ''}`.trim();
                      const vEntry = verfByDateAndMitarbeiter[dayStr]?.[fullName];
                      const statusKey = vEntry?.fields.verfuegbarkeitsstatus?.key;
                      return (
                        <div key={m.record_id} className="flex items-center justify-between py-1 border-b last:border-b-0">
                          <span className="text-sm truncate min-w-0">{fullName}</span>
                          {vEntry ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border ${statusBg[statusKey ?? ''] ?? 'bg-muted text-muted-foreground border-border'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full mr-1 shrink-0 ${statusColor[statusKey ?? ''] ?? 'bg-muted-foreground'}`} />
                                {vEntry.fields.verfuegbarkeitsstatus?.label?.split(' ')[0] ?? '—'}
                              </span>
                              <button onClick={() => openEditVerf(vEntry)} className="p-1 rounded hover:bg-muted transition-colors">
                                <IconPencil size={13} />
                              </button>
                              <button onClick={() => setDeleteVerf(vEntry)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
                                <IconTrash size={13} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">nicht eingetragen</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Shifts list — next 7 days */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <h2 className="font-semibold text-sm">Nächste Schichten (7 Tage)</h2>
          <span className="text-xs text-muted-foreground">{enrichedSchichtzuweisungen.filter(s => {
            if (!s.fields.datum) return false;
            const d = parseISO(s.fields.datum);
            const today = new Date();
            return d >= today && d <= addDays(today, 7);
          }).length} Einträge</span>
        </div>
        <div className="divide-y">
          {enrichedSchichtzuweisungen
            .filter(s => {
              if (!s.fields.datum) return false;
              const d = parseISO(s.fields.datum);
              const today = new Date();
              return d >= today && d <= addDays(today, 7);
            })
            .sort((a, b) => (a.fields.datum ?? '').localeCompare(b.fields.datum ?? ''))
            .slice(0, 10)
            .map(s => (
              <div key={s.record_id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-8 rounded-full shrink-0 bg-primary/60`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{s.mitarbeiterName || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.schichtvorlageName || '—'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-medium">{s.fields.datum ? formatDate(s.fields.datum.slice(0, 10)) : '—'}</p>
                    <p className="text-xs text-muted-foreground">{s.fields.datum?.slice(11, 16) ?? ''} Uhr</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEditSchicht(s)} className="p-1.5 rounded hover:bg-muted transition-colors">
                      <IconPencil size={14} />
                    </button>
                    <button onClick={() => setDeleteSchicht(s)} className="p-1.5 rounded hover:bg-destructive/10 transition-colors">
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          {enrichedSchichtzuweisungen.filter(s => {
            if (!s.fields.datum) return false;
            const d = parseISO(s.fields.datum);
            const today = new Date();
            return d >= today && d <= addDays(today, 7);
          }).length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <IconCalendar size={36} stroke={1.5} />
              <p className="text-sm">Keine Schichten in den nächsten 7 Tagen</p>
              <Button size="sm" variant="outline" onClick={() => openCreateSchicht(new Date())}>
                <IconPlus size={14} className="mr-1" /> Schicht anlegen
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <SchichtzuweisungenDialog
        open={schichtDialog}
        onClose={() => { setSchichtDialog(false); setEditSchicht(null); }}
        onSubmit={handleSchichtSubmit}
        defaultValues={schichtDefaultValues}
        mitarbeiterList={mitarbeiter}
        schichtvorlagenList={schichtvorlagen}
        enablePhotoScan={AI_PHOTO_SCAN['Schichtzuweisungen'] ?? false}
      />
      <VerfuegbarkeitDialog
        open={verfDialog}
        onClose={() => { setVerfDialog(false); setEditVerf(null); }}
        onSubmit={handleVerfSubmit}
        defaultValues={editVerf?.fields}
        mitarbeiterList={mitarbeiter}
        enablePhotoScan={AI_PHOTO_SCAN['Verfuegbarkeit'] ?? false}
      />
      <ConfirmDialog
        open={!!deleteSchicht}
        title="Schicht löschen"
        description={`Schicht von ${deleteSchicht?.mitarbeiterName ?? '—'} wirklich löschen?`}
        onConfirm={handleDeleteSchicht}
        onClose={() => setDeleteSchicht(null)}
      />
      <ConfirmDialog
        open={!!deleteVerf}
        title="Verfügbarkeit löschen"
        description={`Verfügbarkeitseintrag von ${deleteVerf?.mitarbeiterName ?? '—'} wirklich löschen?`}
        onConfirm={handleDeleteVerf}
        onClose={() => setDeleteVerf(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
