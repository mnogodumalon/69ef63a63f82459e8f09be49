import type { EnrichedSchichtzuweisungen, EnrichedVerfuegbarkeit } from '@/types/enriched';
import type { Mitarbeiter, Schichtvorlagen, Schichtzuweisungen, Verfuegbarkeit } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface VerfuegbarkeitMaps {
  mitarbeiterMap: Map<string, Mitarbeiter>;
}

export function enrichVerfuegbarkeit(
  verfuegbarkeit: Verfuegbarkeit[],
  maps: VerfuegbarkeitMaps
): EnrichedVerfuegbarkeit[] {
  return verfuegbarkeit.map(r => ({
    ...r,
    mitarbeiterName: resolveDisplay(r.fields.mitarbeiter, maps.mitarbeiterMap, 'vorname', 'nachname'),
  }));
}

interface SchichtzuweisungenMaps {
  mitarbeiterMap: Map<string, Mitarbeiter>;
  schichtvorlagenMap: Map<string, Schichtvorlagen>;
}

export function enrichSchichtzuweisungen(
  schichtzuweisungen: Schichtzuweisungen[],
  maps: SchichtzuweisungenMaps
): EnrichedSchichtzuweisungen[] {
  return schichtzuweisungen.map(r => ({
    ...r,
    mitarbeiterName: resolveDisplay(r.fields.mitarbeiter, maps.mitarbeiterMap, 'vorname', 'nachname'),
    schichtvorlageName: resolveDisplay(r.fields.schichtvorlage, maps.schichtvorlagenMap, 'schichtname'),
  }));
}
