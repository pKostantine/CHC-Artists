import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { creatorService } from '@/services/creatorService';
import type { CatalogOption, CatalogOptions, CreatorAccount, CreatorDashboardData, CreatorDraft, UploadCandidate } from '@/types/creator';
import { runUpload } from '@/utils/uploads';

/**
 * A release cannot go out inside 48 hours, so the form opens on the third day
 * rather than on a date the database will reject.
 */
function defaultReleaseDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  date.setMinutes(0, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

export const emptyDraft = (): CreatorDraft => ({
  mode: 'music',
  title: '',
  description: '',
  releaseType: 'single',
  musicType: '',
  recordingType: '',
  artistId: '',
  cantorId: '',
  seasonId: '',
  hymnId: '',
  localizedTitle: { en: '', ar: '', cop: '', fr: '' },
  media: [],
  scheduledReleaseAt: defaultReleaseDate(),
  originalReleaseDate: '',
});

const EMPTY_DASHBOARD: CreatorDashboardData = { submissions: [], artists: [], cantors: [] };

interface WorkspaceValue {
  accounts: CreatorAccount[];
  account: CreatorAccount | null;
  selectAccount: (id: string) => void;
  loading: boolean;
  error: string;
  dashboard: CreatorDashboardData;
  catalog: CatalogOptions;
  refresh: () => Promise<void>;
  addPerson: (kind: 'artist' | 'cantor', name: string) => Promise<CatalogOption>;
  /** The in-progress new submission. Lives here so uploads survive navigating away. */
  draft: CreatorDraft;
  setDraft: (update: (current: CreatorDraft) => CreatorDraft) => void;
  resetDraft: () => void;
  uploadDraftFile: (file: UploadCandidate) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<CreatorAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<CreatorDashboardData>(EMPTY_DASHBOARD);
  const [catalog, setCatalog] = useState<CatalogOptions>({ seasons: [], hymns: [] });
  const [draft, setDraftState] = useState<CreatorDraft>(emptyDraft);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await creatorService.ensureWorkspace();
        const [rows, options] = await Promise.all([creatorService.accounts(), creatorService.catalogOptions()]);
        if (cancelled) return;
        setAccounts(rows);
        setCatalog(options);
        setAccountId((current) => current || rows[0]?.id || '');
        if (!rows.length) setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(creatorService.describeError(e));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    if (!accountId) return;
    try {
      setDashboard(await creatorService.dashboard(accountId));
      setError('');
    } catch (e) {
      setError(creatorService.describeError(e));
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    void refresh();
  }, [accountId, refresh]);

  const addPerson = useCallback(async (kind: 'artist' | 'cantor', name: string) => {
    if (!accountId) throw new Error('Your creator workspace is still loading.');
    const row = kind === 'artist'
      ? await creatorService.createArtist(accountId, name)
      : await creatorService.createCantor(accountId, name);
    setDashboard((current) => {
      const key = kind === 'artist' ? 'artists' : 'cantors';
      const list = [...current[key], row].sort((a, b) => a.title.localeCompare(b.title));
      return { ...current, [key]: list };
    });
    return row;
  }, [accountId]);

  const setDraft = useCallback((update: (current: CreatorDraft) => CreatorDraft) => setDraftState(update), []);

  const patchDraftFile = useCallback((id: string, change: Partial<UploadCandidate>) => {
    setDraftState((current) => ({
      ...current,
      artwork: current.artwork?.id === id ? { ...current.artwork, ...change } : current.artwork,
      media: current.media.map((item) => (item.id === id ? { ...item, ...change } : item)),
    }));
  }, []);

  const uploadDraftFile = useCallback((file: UploadCandidate) => {
    if (!accountId) {
      patchDraftFile(file.id, { error: 'Your creator workspace is still loading. Try again in a moment.' });
      return;
    }
    void runUpload(accountId, file, draft.mode, patchDraftFile);
  }, [accountId, draft.mode, patchDraftFile]);

  const value = useMemo<WorkspaceValue>(() => ({
    accounts,
    account: accounts.find((x) => x.id === accountId) ?? null,
    selectAccount: (id) => {
      setAccountId(id);
      setDraftState(emptyDraft());
    },
    loading,
    error,
    dashboard,
    catalog,
    refresh,
    addPerson,
    draft,
    setDraft,
    resetDraft: () => setDraftState(emptyDraft()),
    uploadDraftFile,
  }), [accounts, accountId, loading, error, dashboard, catalog, refresh, addPerson, draft, setDraft, uploadDraftFile]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
