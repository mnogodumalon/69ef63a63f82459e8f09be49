import { useState, useEffect, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { MitarbeiterDialog } from '@/components/dialogs/MitarbeiterDialog';
import { VerfuegbarkeitDialog } from '@/components/dialogs/VerfuegbarkeitDialog';
import { SchichtvorlagenDialog } from '@/components/dialogs/SchichtvorlagenDialog';
import { Button } from '@/components/ui/button';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import type { Mitarbeiter, Schichtvorlagen, Verfuegbarkeit } from '@/types/app';
import {
  IconUser,
  IconClock,
  IconCalendar,
  IconCheck,
  IconArrowLeft,
  IconAlertCircle,
  IconCircleCheck,
  IconRefresh,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Mitarbeiter' },
  { label: 'Datum & Verfügbarkeit' },
  { label: 'Schichtvorlage' },
  { label: 'Bestätigen' },
];

function formatDateDE(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

export default function SchichtplanungPage() {
  // Read initial step from URL hash params
  const getInitialStep = () => {
    try {
      const hash = window.location.hash;
      const queryIndex = hash.indexOf('?');
      if (queryIndex !== -1) {
        const params = new URLSearchParams(hash.slice(queryIndex + 1));
        const stepParam = parseInt(params.get('step') ?? '', 10);
        if (stepParam >= 1 && stepParam <= 4) return stepParam;
      }
    } catch {
      // ignore
    }
    return 1;
  };

  // ALL hooks first — before any early returns
  const { mitarbeiter, schichtvorlagen, verfuegbarkeit, loading, error, fetchAll } = useDashboardData();

  const [currentStep, setCurrentStep] = useState<number>(getInitialStep);

  const [selectedMitarbeiter, setSelectedMitarbeiter] = useState<Mitarbeiter | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedVorlage, setSelectedVorlage] = useState<Schichtvorlagen | null>(null);

  const [verfuegbarkeitForDate, setVerfuegbarkeitForDate] = useState<Verfuegbarkeit[]>([]);

  const [mitarbeiterDialogOpen, setMitarbeiterDialogOpen] = useState(false);
  const [verfuegbarkeitDialogOpen, setVerfuegbarkeitDialogOpen] = useState(false);
  const [vorlagenDialogOpen, setVorlagenDialogOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Filter availability entries whenever mitarbeiter or date changes
  useEffect(() => {
    if (!selectedMitarbeiter || !selectedDate) {
      setVerfuegbarkeitForDate([]);
      return;
    }
    const filtered = verfuegbarkeit.filter(entry => {
      const entryMitarbeiterId = extractRecordId(entry.fields.mitarbeiter);
      // datum field may be full ISO string or just YYYY-MM-DD
      const entryDate = entry.fields.datum ? entry.fields.datum.slice(0, 10) : '';
      return entryMitarbeiterId === selectedMitarbeiter.record_id && entryDate === selectedDate;
    });
    setVerfuegbarkeitForDate(filtered);
  }, [selectedMitarbeiter, selectedDate, verfuegbarkeit]);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleMitarbeiterSelect = useCallback((id: string) => {
    const found = mitarbeiter.find(m => m.record_id === id) ?? null;
    setSelectedMitarbeiter(found);
    setCurrentStep(2);
  }, [mitarbeiter]);

  const handleVorlageSelect = useCallback((id: string) => {
    const found = schichtvorlagen.find(v => v.record_id === id) ?? null;
    setSelectedVorlage(found);
    setCurrentStep(4);
  }, [schichtvorlagen]);

  const handleCreateMitarbeiter = async (fields: Mitarbeiter['fields']) => {
    await LivingAppsService.createMitarbeiterEntry(fields);
    await fetchAll();
    // Auto-select newly created: find newest by checking last in the refreshed list
    // We do this after fetchAll by finding the matching record by fields
    setMitarbeiterDialogOpen(false);
  };

  const handleCreateVerfuegbarkeit = async (fields: Verfuegbarkeit['fields']) => {
    await LivingAppsService.createVerfuegbarkeitEntry(fields);
    await fetchAll();
    setVerfuegbarkeitDialogOpen(false);
  };

  const handleCreateVorlage = async (fields: Schichtvorlagen['fields']) => {
    await LivingAppsService.createSchichtvorlagenEntry(fields);
    await fetchAll();
    setVorlagenDialogOpen(false);
  };

  const handleSubmitZuweisung = async () => {
    if (!selectedMitarbeiter || !selectedVorlage || !selectedDate) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const startzeit = selectedVorlage.fields.startzeit ?? '00:00';
      // Ensure no seconds: take only HH:MM
      const startzeitHHMM = startzeit.slice(0, 5);
      const datum = `${selectedDate}T${startzeitHHMM}`;
      await LivingAppsService.createSchichtzuweisungenEntry({
        mitarbeiter: createRecordUrl(APP_IDS.MITARBEITER, selectedMitarbeiter.record_id),
        schichtvorlage: createRecordUrl(APP_IDS.SCHICHTVORLAGEN, selectedVorlage.record_id),
        datum,
      });
      setSuccess(true);
      await fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Erstellen der Schichtzuweisung');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedMitarbeiter(null);
    setSelectedDate('');
    setSelectedVorlage(null);
    setVerfuegbarkeitForDate([]);
    setSubmitError(null);
    setSuccess(false);
    setCurrentStep(1);
  };

  return (
    <IntentWizardShell
      title="Schicht einplanen"
      subtitle="Weise einem Mitarbeiter eine Schicht zu — Schritt für Schritt."
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ---- STEP 1: Mitarbeiter auswählen ---- */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Mitarbeiter auswählen</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Wähle den Mitarbeiter aus, dem du eine Schicht zuweisen möchtest.
            </p>
          </div>
          <EntitySelectStep
            items={mitarbeiter.map(m => ({
              id: m.record_id,
              title: [m.fields.vorname, m.fields.nachname].filter(Boolean).join(' ') || m.record_id,
              subtitle: m.fields.personalnummer
                ? `Personalnr. ${m.fields.personalnummer}`
                : (m.fields.email ?? ''),
              icon: <IconUser size={18} className="text-primary" />,
            }))}
            onSelect={handleMitarbeiterSelect}
            searchPlaceholder="Mitarbeiter suchen..."
            emptyText="Keine Mitarbeiter gefunden."
            emptyIcon={<IconUser size={32} />}
            createLabel="Neuen Mitarbeiter anlegen"
            onCreateNew={() => setMitarbeiterDialogOpen(true)}
            createDialog={
              <MitarbeiterDialog
                open={mitarbeiterDialogOpen}
                onClose={() => setMitarbeiterDialogOpen(false)}
                onSubmit={handleCreateMitarbeiter}
                defaultValues={undefined}
                enablePhotoScan={AI_PHOTO_SCAN['Mitarbeiter']}
                enablePhotoLocation={AI_PHOTO_LOCATION['Mitarbeiter']}
              />
            }
          />
        </div>
      )}

      {/* ---- STEP 2: Datum & Verfügbarkeit ---- */}
      {currentStep === 2 && selectedMitarbeiter && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconArrowLeft size={14} />
              Zurück
            </button>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Datum &amp; Verfügbarkeit prüfen</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Mitarbeiter:{' '}
              <span className="font-medium text-foreground">
                {[selectedMitarbeiter.fields.vorname, selectedMitarbeiter.fields.nachname]
                  .filter(Boolean)
                  .join(' ')}
              </span>
            </p>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label htmlFor="shift-date" className="text-sm font-medium">
              Schichtdatum
            </label>
            <div className="relative max-w-xs">
              <IconCalendar
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                id="shift-date"
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Availability display */}
          {selectedDate && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconClock size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">
                  Verfügbarkeit am {formatDateDE(selectedDate)}
                </span>
              </div>

              {verfuegbarkeitForDate.length > 0 ? (
                <div className="space-y-2">
                  {verfuegbarkeitForDate.map(entry => (
                    <div
                      key={entry.record_id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40"
                    >
                      <div className="min-w-0">
                        <StatusBadge
                          statusKey={entry.fields.verfuegbarkeitsstatus?.key}
                          label={entry.fields.verfuegbarkeitsstatus?.label}
                        />
                        {entry.fields.notizen && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {entry.fields.notizen}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <IconAlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700">
                      Keine Verfügbarkeit für dieses Datum eingetragen.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVerfuegbarkeitDialogOpen(true)}
                    className="gap-1.5"
                  >
                    <IconCalendar size={14} />
                    Verfügbarkeit eintragen
                  </Button>
                  <VerfuegbarkeitDialog
                    open={verfuegbarkeitDialogOpen}
                    onClose={() => setVerfuegbarkeitDialogOpen(false)}
                    onSubmit={handleCreateVerfuegbarkeit}
                    defaultValues={{
                      mitarbeiter: createRecordUrl(APP_IDS.MITARBEITER, selectedMitarbeiter.record_id),
                      datum: selectedDate,
                    }}
                    mitarbeiterList={mitarbeiter}
                    enablePhotoScan={AI_PHOTO_SCAN['Verfuegbarkeit']}
                    enablePhotoLocation={AI_PHOTO_LOCATION['Verfuegbarkeit']}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setCurrentStep(3)}
              disabled={!selectedDate}
            >
              Weiter zur Schichtvorlage
            </Button>
          </div>
        </div>
      )}

      {/* ---- STEP 3: Schichtvorlage auswählen ---- */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep(2)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <IconArrowLeft size={14} />
              Zurück
            </button>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Schichtvorlage auswählen</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Wähle die Schicht, die du einplanen möchtest.
            </p>
          </div>

          <EntitySelectStep
            items={schichtvorlagen.map(v => ({
              id: v.record_id,
              title: v.fields.schichtname ?? v.record_id,
              subtitle:
                v.fields.startzeit && v.fields.endzeit
                  ? `${v.fields.startzeit} – ${v.fields.endzeit}`
                  : (v.fields.startzeit ?? ''),
              stats: v.fields.beschreibung
                ? [{ label: 'Beschreibung', value: v.fields.beschreibung }]
                : [],
              icon: <IconClock size={18} className="text-primary" />,
            }))}
            onSelect={handleVorlageSelect}
            searchPlaceholder="Schichtvorlage suchen..."
            emptyText="Keine Schichtvorlagen gefunden."
            emptyIcon={<IconClock size={32} />}
            createLabel="Neue Schichtvorlage anlegen"
            onCreateNew={() => setVorlagenDialogOpen(true)}
            createDialog={
              <SchichtvorlagenDialog
                open={vorlagenDialogOpen}
                onClose={() => setVorlagenDialogOpen(false)}
                onSubmit={handleCreateVorlage}
                defaultValues={undefined}
                enablePhotoScan={AI_PHOTO_SCAN['Schichtvorlagen']}
                enablePhotoLocation={AI_PHOTO_LOCATION['Schichtvorlagen']}
              />
            }
          />
        </div>
      )}

      {/* ---- STEP 4: Zuweisung bestätigen & erstellen ---- */}
      {currentStep === 4 && selectedMitarbeiter && selectedVorlage && selectedDate && (
        <div className="space-y-5">
          {!success && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <IconArrowLeft size={14} />
                Zurück
              </button>
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold">Zuweisung bestätigen</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Überprüfe die Details und erstelle die Schichtzuweisung.
            </p>
          </div>

          {/* Success state */}
          {success ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-10 gap-4 rounded-2xl border bg-green-50">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
                  <IconCircleCheck size={28} className="text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="font-semibold text-green-800 text-lg">
                    Schichtzuweisung erfolgreich erstellt!
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    {[selectedMitarbeiter.fields.vorname, selectedMitarbeiter.fields.nachname]
                      .filter(Boolean)
                      .join(' ')}{' '}
                    wurde der Schicht &ldquo;{selectedVorlage.fields.schichtname}&rdquo; am{' '}
                    {formatDateDE(selectedDate)} zugewiesen.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="gap-1.5"
                >
                  <IconRefresh size={15} />
                  Weitere Schicht planen
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary card */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b bg-muted/30">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Zusammenfassung
                  </h3>
                </div>
                <div className="divide-y">
                  {/* Mitarbeiter row */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <IconUser size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Mitarbeiter</p>
                      <p className="text-sm font-medium truncate">
                        {[selectedMitarbeiter.fields.vorname, selectedMitarbeiter.fields.nachname]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                      {selectedMitarbeiter.fields.personalnummer && (
                        <p className="text-xs text-muted-foreground">
                          Personalnr. {selectedMitarbeiter.fields.personalnummer}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Datum row */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <IconCalendar size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Datum</p>
                      <p className="text-sm font-medium">{formatDateDE(selectedDate)}</p>
                    </div>
                  </div>

                  {/* Schicht row */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <IconClock size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Schicht</p>
                      <p className="text-sm font-medium truncate">
                        {selectedVorlage.fields.schichtname}
                      </p>
                      {selectedVorlage.fields.startzeit && selectedVorlage.fields.endzeit && (
                        <p className="text-xs text-muted-foreground">
                          {selectedVorlage.fields.startzeit} – {selectedVorlage.fields.endzeit}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {submitError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <IconAlertCircle size={16} className="text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{submitError}</p>
                </div>
              )}

              {/* Submit button */}
              <div className="flex justify-end">
                <Button
                  onClick={handleSubmitZuweisung}
                  disabled={submitting}
                  className="gap-1.5"
                >
                  {submitting ? (
                    <>Wird erstellt...</>
                  ) : (
                    <>
                      <IconCheck size={16} />
                      Zuweisung erstellen
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
