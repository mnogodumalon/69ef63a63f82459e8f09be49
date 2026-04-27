// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export interface Mitarbeiter {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    personalnummer?: string;
    email?: string;
    telefon?: string;
  };
}

export interface Schichtvorlagen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    schichtname?: string;
    startzeit?: string;
    endzeit?: string;
    beschreibung?: string;
  };
}

export interface Verfuegbarkeit {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    mitarbeiter?: string; // applookup -> URL zu 'Mitarbeiter' Record
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    verfuegbarkeitsstatus?: LookupValue;
    notizen?: string;
  };
}

export interface Schichtzuweisungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    mitarbeiter?: string; // applookup -> URL zu 'Mitarbeiter' Record
    schichtvorlage?: string; // applookup -> URL zu 'Schichtvorlagen' Record
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    tatsaechliche_startzeit?: string;
    tatsaechliche_endzeit?: string;
    bemerkungen?: string;
  };
}

export const APP_IDS = {
  MITARBEITER: '69ef6388b28deed69bebae76',
  SCHICHTVORLAGEN: '69ef638f9a9152e2ea3688e3',
  VERFUEGBARKEIT: '69ef63909310729986d3d860',
  SCHICHTZUWEISUNGEN: '69ef6391561612c76f338dfc',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'verfuegbarkeit': {
    verfuegbarkeitsstatus: [{ key: "verfuegbar", label: "Verfügbar" }, { key: "nicht_verfuegbar", label: "Nicht verfügbar" }, { key: "eingeschraenkt_verfuegbar", label: "Eingeschränkt verfügbar" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'mitarbeiter': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'personalnummer': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
  },
  'schichtvorlagen': {
    'schichtname': 'string/text',
    'startzeit': 'string/text',
    'endzeit': 'string/text',
    'beschreibung': 'string/textarea',
  },
  'verfuegbarkeit': {
    'mitarbeiter': 'applookup/select',
    'datum': 'date/date',
    'verfuegbarkeitsstatus': 'lookup/select',
    'notizen': 'string/textarea',
  },
  'schichtzuweisungen': {
    'mitarbeiter': 'applookup/select',
    'schichtvorlage': 'applookup/select',
    'datum': 'date/datetimeminute',
    'tatsaechliche_startzeit': 'string/text',
    'tatsaechliche_endzeit': 'string/text',
    'bemerkungen': 'string/textarea',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateMitarbeiter = StripLookup<Mitarbeiter['fields']>;
export type CreateSchichtvorlagen = StripLookup<Schichtvorlagen['fields']>;
export type CreateVerfuegbarkeit = StripLookup<Verfuegbarkeit['fields']>;
export type CreateSchichtzuweisungen = StripLookup<Schichtzuweisungen['fields']>;