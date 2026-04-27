import { useState, useEffect, useCallback } from 'react';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { SchichtvorlagenDialog } from '@/components/dialogs/SchichtvorlagenDialog';
import { MitarbeiterDialog } from '@/components/dialogs/MitarbeiterDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import type { Mitarbeiter, Schichtvorlagen, Schichtzuweisungen } from '@/types/app';
import {
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconUsers,
} from '@tabler/icons-react';

// ──────────────────────────────────────────────
// Date helpers
// ──────────────────────────────────────────────

function getCurrentMonday(): string {
  const today = new Date();
  const day = today.getDay(); // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function getWeekDays(mondayDateStr: string): string[] {
  const result: string[] = [];
  const base = new Date(mondayDateStr + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function formatDateShort(dateStr: string): string {
  // Returns e.g. "Mo, 06.11."
  const d = new Date(dateStr + 'T00:00:00');
  const dayIdx = (d.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${DAY_SHORT[dayIdx]}, ${dd}.${mm}.`;
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const dayIdx = (d.getDay() + 6) % 7;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${DAY_SHORT[dayIdx]}, ${dd}.${mm}.${yyyy}`;
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type AssignmentKey = string; // "{mitarbeiterId}|{dateString}"

function makeKey(mitarbeiterId: string, date: string): AssignmentKey {
  return `${mitarbeiterId}|${date}`;
}

const WIZARD_STEPS = [
  { label: 'Woche' },
  { label: 'Schichtvorlage' },
  { label: 'Mitarbeiter & Tage' },
  { label: 'Erstellen' },
];

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function WochenplanPage() {
  // ── Step state ──
  const [currentStep, setCurrentStep] = useState<number>(1);

  // ── Data state ──
  const [mitarbeiterList, setMitarbeiterList] = useState<Mitarbeiter[]>([]);
  const [schichtvorlagenList, setSchichtvorlagenList] = useState<Schichtvorlagen[]>([]);
  const [existingZuweisungen, setExistingZuweisungen] = useState<Schichtzuweisungen[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // ── Wizard selections ──
  const [weekStart, setWeekStart] = useState<string>(getCurrentMonday());
  const [selectedVorlage, setSelectedVorlage] = useState<Schichtvorlagen | null>(null);
  const [selectedAssignments, setSelectedAssignments] = useState<Set<AssignmentKey>>(new Set());

  // ── Dialog state ──
  const [vorlageDialogOpen, setVorlageDialogOpen] = useState(false);
  const [mitarbeiterDialogOpen, setMitarbeiterDialogOpen] = useState(false);

  // ── Creation progress ──
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState<{ done: number; total: number } | null>(null);
  const [createSuccess, setCreateSuccess] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // ── Deep-link: read ?step= from hash ──
  useEffect(() => {
    const hash = window.location.hash; // e.g. "#/intents/wochenplan?step=2"
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const params = new URLSearchParams(hash.slice(qIndex + 1));
      const s = parseInt(params.get('step') ?? '', 10);
      if (s >= 1 && s <= 4) setCurrentStep(s);
    }
  }, []);

  // ── Fetch all data ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [ma, sv, sz] = await Promise.all([
        LivingAppsService.getMitarbeiter(),
        LivingAppsService.getSchichtvorlagen(),
        LivingAppsService.getSchichtzuweisungen(),
      ]);
      setMitarbeiterList(ma);
      setSchichtvorlagenList(sv);
      setExistingZuweisungen(sz);
    } catch (err) {
      setLoadError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Derived values ──
  const weekDays = getWeekDays(weekStart);

  const weekAssignmentCount = existingZuweisungen.filter(sz => {
    if (!sz.fields.datum) return false;
    const d = sz.fields.datum.slice(0, 10);
    return d >= weekDays[0] && d <= weekDays[6];
  }).length;

  // Build set of existing assignment keys for current vorlage + week
  const existingKeys = new Set<AssignmentKey>(
    existingZuweisungen
      .filter(sz => {
        if (!sz.fields.datum || !sz.fields.schichtvorlage || !selectedVorlage) return false;
        const d = sz.fields.datum.slice(0, 10);
        const vorlageId = extractRecordId(sz.fields.schichtvorlage);
        return d >= weekDays[0] && d <= weekDays[6] && vorlageId === selectedVorlage.record_id;
      })
      .map(sz => {
        const mitId = extractRecordId(sz.fields.mitarbeiter ?? '') ?? '';
        const d = sz.fields.datum!.slice(0, 10);
        return makeKey(mitId, d);
      })
  );

  const checkedCount = selectedAssignments.size;

  // ── Handlers ──

  function handleWeiterStep1() {
    setCurrentStep(2);
  }

  function handleVorlageSelect(id: string) {
    const v = schichtvorlagenList.find(s => s.record_id === id) ?? null;
    setSelectedVorlage(v);
    // Clear existing selections when vorlage changes
    setSelectedAssignments(new Set());
    setCurrentStep(3);
  }

  function toggleAssignment(mitarbeiterId: string, date: string) {
    const key = makeKey(mitarbeiterId, date);
    if (existingKeys.has(key)) return; // cannot toggle already-existing
    setSelectedAssignments(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllForDay(date: string) {
    const newSet = new Set(selectedAssignments);
    const freeMitarbeiter = mitarbeiterList.filter(m => !existingKeys.has(makeKey(m.record_id, date)));
    const allChecked = freeMitarbeiter.every(m => newSet.has(makeKey(m.record_id, date)));
    freeMitarbeiter.forEach(m => {
      const key = makeKey(m.record_id, date);
      if (allChecked) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
    });
    setSelectedAssignments(newSet);
  }

  function toggleAllForMitarbeiter(mitarbeiterId: string) {
    const newSet = new Set(selectedAssignments);
    const freeDays = weekDays.filter(d => !existingKeys.has(makeKey(mitarbeiterId, d)));
    const allChecked = freeDays.every(d => newSet.has(makeKey(mitarbeiterId, d)));
    freeDays.forEach(d => {
      const key = makeKey(mitarbeiterId, d);
      if (allChecked) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
    });
    setSelectedAssignments(newSet);
  }

  async function handleCreate() {
    if (!selectedVorlage || selectedAssignments.size === 0) return;
    setCreating(true);
    setCreateError(null);
    setCreateProgress({ done: 0, total: selectedAssignments.size });

    const pairs = Array.from(selectedAssignments).map(key => {
      const [mitarbeiterId, date] = key.split('|');
      return { mitarbeiterId, date };
    });

    let done = 0;
    const errors: string[] = [];

    for (const { mitarbeiterId, date } of pairs) {
      try {
        const startzeit = selectedVorlage.fields.startzeit ?? '00:00';
        // Ensure NO seconds in datetimeminute: YYYY-MM-DDTHH:MM
        const startzeitClean = startzeit.slice(0, 5); // take "HH:MM"
        const datum = `${date}T${startzeitClean}`;
        await LivingAppsService.createSchichtzuweisungenEntry({
          mitarbeiter: createRecordUrl(APP_IDS.MITARBEITER, mitarbeiterId),
          schichtvorlage: createRecordUrl(APP_IDS.SCHICHTVORLAGEN, selectedVorlage.record_id),
          datum,
        });
        done++;
        setCreateProgress({ done, total: pairs.length });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    await fetchAll();
    setCreating(false);
    setCreateProgress(null);

    if (errors.length > 0) {
      setCreateError(`${done} von ${pairs.length} Zuweisungen erstellt. Fehler: ${errors[0]}`);
    } else {
      setCreateSuccess(done);
    }
  }

  function handleReset() {
    setCurrentStep(1);
    setWeekStart(getCurrentMonday());
    setSelectedVorlage(null);
    setSelectedAssignments(new Set());
    setCreateSuccess(null);
    setCreateError(null);
  }

  // ── Render ──

  return (
    <IntentWizardShell
      title="Wochenplan erstellen"
      subtitle="Weise Mitarbeitern Schichten für eine ganze Woche zu"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      loading={loading}
      error={loadError}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Woche auswählen ── */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 space-y-5 overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendar size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Woche auswählen</h2>
                <p className="text-sm text-muted-foreground">Wähle den Montag der gewünschten Woche</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekstart">Wochenbeginn (Montag)</Label>
              <Input
                id="weekstart"
                type="date"
                value={weekStart}
                onChange={e => setWeekStart(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Week days preview */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Woche im Überblick</p>
              <div className="grid grid-cols-7 gap-1">
                {weekDays.map((d, i) => {
                  const isWeekend = i >= 5;
                  return (
                    <div
                      key={d}
                      className={`rounded-lg p-2 text-center text-xs border ${
                        isWeekend
                          ? 'bg-muted/40 text-muted-foreground'
                          : 'bg-primary/5 border-primary/20 text-foreground'
                      }`}
                    >
                      <div className="font-semibold">{DAY_SHORT[i]}</div>
                      <div className="mt-0.5 text-muted-foreground">
                        {(() => {
                          const dt = new Date(d + 'T00:00:00');
                          return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.`;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Existing assignment count */}
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3">
              <IconUsers size={16} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                Bereits geplant diese Woche:{' '}
                <span className="font-semibold text-foreground">{weekAssignmentCount} Schichtzuweisungen</span>
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleWeiterStep1} disabled={!weekStart} className="gap-2">
              Weiter
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Schichtvorlage wählen ── */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 space-y-4 overflow-hidden">
            <div>
              <h2 className="font-semibold text-base">Schichtvorlage wählen</h2>
              <p className="text-sm text-muted-foreground">Welche Schicht soll diese Woche verplant werden?</p>
            </div>

            <EntitySelectStep
              items={schichtvorlagenList.map(sv => ({
                id: sv.record_id,
                title: sv.fields.schichtname ?? '(Ohne Name)',
                subtitle: sv.fields.startzeit && sv.fields.endzeit
                  ? `${sv.fields.startzeit} – ${sv.fields.endzeit}`
                  : sv.fields.startzeit ?? sv.fields.endzeit ?? undefined,
                stats: sv.fields.beschreibung
                  ? [{ label: 'Beschreibung', value: sv.fields.beschreibung }]
                  : undefined,
              }))}
              onSelect={handleVorlageSelect}
              searchPlaceholder="Schicht suchen..."
              emptyText="Keine Schichtvorlagen vorhanden."
              createLabel="Neue Schichtvorlage"
              onCreateNew={() => setVorlageDialogOpen(true)}
              createDialog={
                <SchichtvorlagenDialog
                  open={vorlageDialogOpen}
                  onClose={() => setVorlageDialogOpen(false)}
                  onSubmit={async (fields) => {
                    await LivingAppsService.createSchichtvorlagenEntry(fields);
                    await fetchAll();
                  }}
                  defaultValues={undefined}
                  enablePhotoScan={AI_PHOTO_SCAN['Schichtvorlagen']}
                  enablePhotoLocation={AI_PHOTO_LOCATION['Schichtvorlagen']}
                />
              }
            />
          </div>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-2">
              Zurück
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Mitarbeiter & Tage auswählen ── */}
      {currentStep === 3 && selectedVorlage && (
        <div className="space-y-6">
          <div className="rounded-2xl border bg-card overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b bg-muted/30">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-base">Mitarbeiter & Tage zuweisen</h2>
                  <p className="text-sm text-muted-foreground">
                    Schicht: <span className="font-medium text-foreground">{selectedVorlage.fields.schichtname}</span>
                    {selectedVorlage.fields.startzeit && selectedVorlage.fields.endzeit && (
                      <span className="ml-1 text-muted-foreground">
                        ({selectedVorlage.fields.startzeit} – {selectedVorlage.fields.endzeit})
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2 shrink-0">
                  <IconCheck size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-primary">{checkedCount} ausgewählt</span>
                </div>
              </div>
            </div>

            {/* Matrix table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[160px] sticky left-0 bg-card z-10 border-r">
                      Mitarbeiter
                    </th>
                    {weekDays.map((d, i) => (
                      <th
                        key={d}
                        className="px-2 py-3 font-medium text-center min-w-[80px]"
                      >
                        <button
                          type="button"
                          className="flex flex-col items-center gap-0.5 w-full hover:bg-primary/10 rounded-lg p-1 transition-colors"
                          onClick={() => toggleAllForDay(d)}
                          title={`Alle für ${formatDateFull(d)} auswählen`}
                        >
                          <span className={i >= 5 ? 'text-muted-foreground' : 'text-foreground'}>
                            {DAY_SHORT[i]}
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {(() => {
                              const dt = new Date(d + 'T00:00:00');
                              return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.`;
                            })()}
                          </span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mitarbeiterList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                        Keine Mitarbeiter vorhanden.
                      </td>
                    </tr>
                  ) : (
                    mitarbeiterList.map(m => {
                      const name = [m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)';
                      return (
                        <tr key={m.record_id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 sticky left-0 bg-card z-10 border-r">
                            <button
                              type="button"
                              className="text-left w-full hover:text-primary transition-colors"
                              onClick={() => toggleAllForMitarbeiter(m.record_id)}
                              title="Alle Tage für diesen Mitarbeiter auswählen"
                            >
                              <span className="font-medium text-sm truncate block max-w-[148px]">{name}</span>
                              {m.fields.personalnummer && (
                                <span className="text-xs text-muted-foreground">Nr. {m.fields.personalnummer}</span>
                              )}
                            </button>
                          </td>
                          {weekDays.map(d => {
                            const key = makeKey(m.record_id, d);
                            const alreadyExists = existingKeys.has(key);
                            const checked = selectedAssignments.has(key);
                            return (
                              <td key={d} className="px-2 py-3 text-center">
                                {alreadyExists ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="w-5 h-5 rounded bg-green-100 border border-green-300 flex items-center justify-center">
                                      <IconCheck size={11} className="text-green-600" />
                                    </div>
                                    <span className="text-[10px] text-green-600 font-medium leading-tight">
                                      geplant
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleAssignment(m.record_id, d)}
                                    className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                                      checked
                                        ? 'bg-primary border-primary'
                                        : 'border-muted-foreground/40 hover:border-primary/60 bg-background'
                                    }`}
                                    aria-label={`${name} am ${formatDateFull(d)} auswählen`}
                                  >
                                    {checked && <IconCheck size={13} className="text-primary-foreground" stroke={2.5} />}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Add new employee button */}
            <div className="p-4 border-t bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMitarbeiterDialogOpen(true)}
                className="gap-2"
              >
                <IconPlus size={15} />
                Neuen Mitarbeiter anlegen
              </Button>
              <MitarbeiterDialog
                open={mitarbeiterDialogOpen}
                onClose={() => setMitarbeiterDialogOpen(false)}
                onSubmit={async (fields) => {
                  await LivingAppsService.createMitarbeiterEntry(fields);
                  await fetchAll();
                }}
                defaultValues={undefined}
                enablePhotoScan={AI_PHOTO_SCAN['Mitarbeiter']}
                enablePhotoLocation={AI_PHOTO_LOCATION['Mitarbeiter']}
              />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(2)}>
              Zurück
            </Button>
            <Button
              onClick={() => setCurrentStep(4)}
              disabled={checkedCount === 0}
              className="gap-2"
            >
              Weiter ({checkedCount} Zuweisung{checkedCount !== 1 ? 'en' : ''})
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Übersicht & Erstellen ── */}
      {currentStep === 4 && (
        <div className="space-y-6">
          {createSuccess !== null ? (
            /* Success state */
            <div className="rounded-2xl border bg-card p-8 text-center space-y-4 overflow-hidden">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <IconCheck size={28} className="text-green-600" stroke={2.5} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-green-700">Fertig!</h2>
                <p className="text-muted-foreground mt-1">
                  <span className="font-semibold text-foreground">{createSuccess} Schichtzuweisung{createSuccess !== 1 ? 'en' : ''}</span>{' '}
                  erfolgreich erstellt.
                </p>
              </div>
              <Button onClick={handleReset} variant="outline" className="gap-2">
                <IconRefresh size={16} />
                Neuen Wochenplan erstellen
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border bg-card overflow-hidden">
                {/* Summary header */}
                <div className="p-5 border-b bg-muted/30">
                  <h2 className="font-semibold text-base">Zuweisungen erstellen</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Überprüfe alle Zuweisungen, bevor sie gespeichert werden.
                  </p>
                </div>

                {/* Summary info */}
                <div className="p-5 border-b grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Woche</p>
                    <p className="font-semibold mt-1">{formatDateFull(weekDays[0])} – {formatDateFull(weekDays[6])}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Schichtvorlage</p>
                    <p className="font-semibold mt-1">{selectedVorlage?.fields.schichtname ?? '–'}</p>
                    {selectedVorlage?.fields.startzeit && selectedVorlage?.fields.endzeit && (
                      <p className="text-xs text-muted-foreground">{selectedVorlage.fields.startzeit} – {selectedVorlage.fields.endzeit}</p>
                    )}
                  </div>
                  <div className="rounded-xl bg-primary/10 p-4">
                    <p className="text-xs text-primary/70 font-medium uppercase tracking-wide">Neue Zuweisungen</p>
                    <p className="font-bold text-primary text-lg mt-1">{selectedAssignments.size}</p>
                  </div>
                </div>

                {/* Assignment list */}
                <div className="divide-y max-h-72 overflow-y-auto">
                  {Array.from(selectedAssignments)
                    .sort()
                    .map(key => {
                      const [mitarbeiterId, date] = key.split('|');
                      const m = mitarbeiterList.find(ma => ma.record_id === mitarbeiterId);
                      const name = m
                        ? [m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'
                        : mitarbeiterId;
                      return (
                        <div key={key} className="flex items-center justify-between px-5 py-3 gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <IconUsers size={14} className="text-primary" />
                            </div>
                            <span className="font-medium text-sm truncate">{name}</span>
                          </div>
                          <span className="text-sm text-muted-foreground shrink-0">{formatDateShort(date)}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Error display */}
              {createError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {createError}
                </div>
              )}

              {/* Progress indicator */}
              {creating && createProgress && (
                <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
                  <IconLoader2 size={18} className="text-primary animate-spin shrink-0" />
                  <span className="text-sm font-medium">
                    Erstelle {createProgress.done + 1} von {createProgress.total}...
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.round((createProgress.done / createProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep(3)} disabled={creating}>
                  Zurück
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating || selectedAssignments.size === 0}
                  className="gap-2"
                >
                  {creating ? (
                    <>
                      <IconLoader2 size={16} className="animate-spin" />
                      Wird erstellt...
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      Jetzt erstellen ({selectedAssignments.size})
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
