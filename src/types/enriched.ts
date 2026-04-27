import type { Schichtzuweisungen, Verfuegbarkeit } from './app';

export type EnrichedVerfuegbarkeit = Verfuegbarkeit & {
  mitarbeiterName: string;
};

export type EnrichedSchichtzuweisungen = Schichtzuweisungen & {
  mitarbeiterName: string;
  schichtvorlageName: string;
};
