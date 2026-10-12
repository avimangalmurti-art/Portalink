export const LEGAL_KEYS = ['terms', 'privacy', 'content-licence', 'ai-access'] as const;
export type LegalKey = typeof LEGAL_KEYS[number];
export type LegalVersion = { key: LegalKey; version: string };
export type LegalDocument = LegalVersion & { title: string; markdown_body: string; effective_at: string };
export type TermsAcceptance = LegalVersion & { accepted_at: string };
export interface LegalService {
  documents(): Promise<LegalDocument[]>;
  acceptances(accountId: string): Promise<TermsAcceptance[]>;
  accept(accountId: string, versions: LegalVersion[]): Promise<void>;
  signupConsent(accountId: string): Promise<LegalVersion[] | null>;
  sendEmail(): Promise<string>;
}
export function compareLegalVersions(a: string, b: string): number {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0); if (delta) return Math.sign(delta);
  }
  return 0;
}
export function latestLegalDocuments(rows: LegalDocument[], now = Date.now()): LegalDocument[] {
  return LEGAL_KEYS.map(key => {
    const matches = rows.filter(row => row.key === key && /^\d+(\.\d+){1,2}$/.test(row.version) && Date.parse(row.effective_at) <= now)
      .sort((a,b) => compareLegalVersions(b.version,a.version));
    if (!matches[0]) throw new Error('The agreements are temporarily unavailable. Please try again.');
    return matches[0];
  });
}
export function needsTermsAcceptance(documents: LegalDocument[], accepted: TermsAcceptance[]): boolean {
  return documents.some(document => !accepted.some(row => row.key === document.key && compareLegalVersions(row.version,document.version) >= 0));
}
export function parseSignupConsent(value: unknown): LegalVersion[] | null {
  if (!Array.isArray(value) || value.length !== LEGAL_KEYS.length) return null;
  const versions = value as Partial<LegalVersion>[];
  if (!LEGAL_KEYS.every(key => versions.filter(row => row?.key === key && typeof row.version === 'string' && /^\d+(\.\d+){1,2}$/.test(row.version)).length === 1)) return null;
  return versions as LegalVersion[];
}
export const contentLevels = [
  { title: 'Private', intro: 'Only you' },
  { title: 'Public', intro: 'People may view' },
  { title: 'Citable', intro: 'People and their AI tools may use single pages or images, with your name' },
];
export function contentLevelText(document: LegalDocument, level: typeof contentLevels[number]): string {
  const pattern = new RegExp(`^## ${level.title}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
  const section = pattern.exec(document.markdown_body)?.[1]?.trim();
  if (!section) return 'Read the agreement text below for this visibility level.';
  const plain = section.replace(/\*\*/g, '').replace(/\s+/g, ' ');
  return plain.startsWith(`${level.intro}. `) ? plain.slice(level.intro.length + 2) : plain;
}
