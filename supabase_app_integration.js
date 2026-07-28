import { initSupabase } from './supabase_init.js';
import { RemoteAdapterSupabaseClient } from './remoteAdapterSupabase.client.js';
import { StorageManagerClient } from './storageManager.client.js';
import { SyncManagerClient } from './syncManager.client.js';

// Expect SUPABASE_URL and SUPABASE_KEY to be set on window (or via env injection)
const SUPABASE_URL = window.SUPABASE_URL || null;
const SUPABASE_KEY = window.SUPABASE_KEY || null;

const el = (id) => document.getElementById(id);
const userAvatarEl = el('userAvatar');
const userNameEl = el('userName');
const loginBtn = el('loginBtn');
const logoutBtn = el('logoutBtn');
const syncStatusEl = el('syncStatus');

let supabase = null;
let storageManager = null;
let remoteAdapter = null;
let syncManager = null;
let currentUser = null;

function setSyncStatus(s) {
  if (!syncStatusEl) return;
  syncStatusEl.textContent = s;
  syncStatusEl.dataset.status = s;
}

function showUser(user) {
  if (!user) {
    if (userAvatarEl) userAvatarEl.classList.add('hidden');
    if (userNameEl) userNameEl.textContent = '';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    setSyncStatus('未ログイン');
    return;
  }
  if (userAvatarEl && user.user_metadata?.avatar_url) {
    userAvatarEl.src = user.user_metadata.avatar_url;
    userAvatarEl.classList.remove('hidden');
  }
  if (userNameEl) userNameEl.textContent = user.user_metadata?.full_name || user.email || '';
  if (loginBtn) loginBtn.classList.add('hidden');
  if (logoutBtn) logoutBtn.classList.remove('hidden');
}

async function initializeAfterLogin(user) {
  setSyncStatus('同期待機');
  try {
    // create adapters and managers
    remoteAdapter = new RemoteAdapterSupabaseClient(supabase);
    syncManager = new SyncManagerClient(remoteAdapter, { onRemoteMerge: async (merged) => await applyRemoteMerge(merged) });
    storageManager = new StorageManagerClient({ syncManager });

    // load local data
    await storageManager.load();

    // run initial full sync
    setSyncStatus('同期中');
    try {
      // enqueue current snapshot
      syncManager.enqueue(await storageManager.load());
      await syncManager.trySync();
      setSyncStatus('同期完了');
    } catch (e) {
      console.error('Initial sync failed', e);
      setSyncStatus('同期エラー');
    }

    // setup online/offline listeners to update status and trigger sync
    window.addEventListener('online', async () => {
      setSyncStatus('オンライン - 同期待機');
      if (syncManager) {
        syncManager.enqueue(await storageManager.load());
        await syncManager.trySync();
      }
    });
    window.addEventListener('offline', () => setSyncStatus('オフライン'));

    // reflect UI
    showUser(user);

    // expose storageManager for app scripts to use (keeps API unchanged)
    window.StorageManager = storageManager;
    window.SyncManager = syncManager;
    window.RemoteAdapter = remoteAdapter;
  } catch (e) {
    console.error('initializeAfterLogin error', e);
    setSyncStatus('エラー');
  }
}

async function applyRemoteMerge(merged) {
  if (!merged || !storageManager) return;
  try {
    // merge statistics
    if (merged.statistics) {
      const s = {
        totalAnswers: merged.statistics.total_answers || 0,
        correct: merged.statistics.correct || 0,
        wrong: merged.statistics.wrong || 0,
        totalStudyTimeSeconds: merged.statistics.total_study_seconds || 0,
        totalStudyDays: merged.statistics.total_study_days || 0,
        streakDays: merged.statistics.streak_days || 0,
        lastStudiedAt: merged.statistics.last_studied || null,
        updatedAt: merged.statistics.updated_at || new Date().toISOString()
      };
      await storageManager.saveStatistics(s);
    }

    // merge wordStats: remoteSnapshot.wordStats is array
    if (merged.wordStats && Array.isArray(merged.wordStats)) {
      const localWordStats = await storageManager.loadWordStats();
      for (const r of merged.wordStats) {
        const key = r.word_id;
        // map server record to local shape
        const mapped = {
          wordId: key,
          correct: r.correct || 0,
          wrong: r.wrong || 0,
          consecutiveCorrect: r.consecutive_correct || 0,
          isFavorite: !!r.is_favorite,
          lastStudied: r.last_studied || null,
          totalStudyTimeSeconds: r.total_study_seconds || 0,
          createdAt: r.created_at || new Date().toISOString(),
          updatedAt: r.updated_at || new Date().toISOString(),
          rev: r.rev || 1
        };
        localWordStats[key] = mapped;
      }
      await storageManager.saveWordStats(localWordStats);
    }

    // merge history: append remote entries missing locally
    if (merged.history && Array.isArray(merged.history)) {
      const localHistory = await storageManager.loadHistory();
      const localIds = new Set((localHistory || []).map(h => h.id));
      for (const h of merged.history) {
        if (!localIds.has(h.id)) {
          const mapped = {
            id: h.id,
            wordId: h.word_id || null,
            isCorrect: !!h.is_correct,
            answer: h.answer || null,
            correctAnswer: h.correct_answer || null,
            responseTimeSeconds: h.response_time_seconds || 0,
            mode: h.mode || null,
            direction: h.direction || null,
            createdAt: h.created_at || new Date().toISOString()
          };
          await storageManager.saveHistory(mapped);
        }
      }
    }
  } catch (e) {
    console.error('applyRemoteMerge failed', e);
  }
}

async function signIn() {
  if (!supabase) {
    setSyncStatus('Supabase 未設定');
    return;
  }
  try {
    setSyncStatus('ログイン中');
    await supabase.auth.signInWithOAuth({ provider: 'google' });
    // redirect flow, onAuthChange will handle the rest
  } catch (e) {
    console.error('signIn failed', e);
    setSyncStatus('ログイン失敗');
  }
}

async function safeSignOut() {
  try {
    setSyncStatus('サインアウト処理中');
    // attempt final sync if needed
    if (syncManager && syncManager.lastSnapshot) {
      setSyncStatus('同期中（サインアウト前）');
      try { await syncManager.trySync(); } catch (e) { console.warn('final sync failed', e); }
    }
    // shutdown managers
    if (syncManager) {
      try { syncManager.remote = null; syncManager.lastSnapshot = null; } catch (e) {}
      syncManager = null;
    }
    if (storageManager) {
      try { /* nothing to close for localStorage */ } catch (e) {}
      storageManager = null;
    }
    // sign out from supabase
    await supabase.auth.signOut();
    showUser(null);
    setSyncStatus('サインアウト完了');
  } catch (e) {
    console.error('safeSignOut failed', e);
    setSyncStatus('サインアウト失敗');
  }
}

async function init() {
  // wire button handlers
  if (loginBtn) loginBtn.addEventListener('click', () => signIn());
  if (logoutBtn) logoutBtn.addEventListener('click', () => safeSignOut());

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Supabase keys not provided; auth disabled');
    setSyncStatus('Supabase 未設定');
    showUser(null);
    return;
  }

  try {
    const sup = await initSupabase(SUPABASE_URL, SUPABASE_KEY);
    supabase = sup.supabase;

    // subscribe to auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session && session.access_token) {
          // logged in
          const { data } = await supabase.auth.getUser();
          currentUser = data?.user || null;
          showUser(currentUser);
          await initializeAfterLogin(currentUser);
        } else {
          // logged out
          currentUser = null;
          showUser(null);
        }
      } catch (e) { console.error('onAuthStateChange handler error', e); }
    });

    // check current user
    const { data } = await supabase.auth.getUser();
    const user = data?.user || null;
    if (user) {
      currentUser = user;
      showUser(user);
      await initializeAfterLogin(user);
    } else {
      showUser(null);
      setSyncStatus('未ログイン');
    }
  } catch (e) {
    console.error('init supabase failed', e);
    setSyncStatus('Supabase 初期化失敗');
  }
}

// start when DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
