
/**
 * 英単語テストアプリ
 *
 * モジュール構成:
 *   - StorageManager  … localStorage の読み書き・学習データ管理
 *   - QuizManager     … 出題順・方向の管理
 *   - AnswerChecker   … 回答判定
 *   - TimerManager    … 制限時間タイマー
 *   - UIManager       … DOM 更新
 *   - App             … 全体の初期化・イベント連携
 *
 * 将来の拡張ポイント（CSV, SRS, 発音, 検索, タグ, お気に入り, AI例文）:
 *   - words 配列は words.js で独立管理（CSV 読み込み時はここを差し替え）
 *   - WordRecord に tags / favorite / srs フィールドを追加可能
 *   - StorageManager に export/import メソッドを追加可能
 */

// =============================================================================
// 定数
// =============================================================================

const STORAGE_KEY = "vocabularyAppData";
const TIMER_SECONDS = 5;
const TIMEOUT_DELAY_MS = 1500;
const ANSWER_DELAY_MS = 1200;
const WEAK_WORD_GRADUATE_COUNT = 3;

/** 日本語の複数意味を分割する区切り文字 */
const JAPANESE_DELIMITERS = /[、,，\/・]/;

/** 出題方向 */
const Direction = {
    EN_TO_JP: "enToJp",
    JP_TO_EN: "jpToEn"
};

// Supabase client (optional). If window.SUPABASE_URL and window.SUPABASE_KEY are set,
// attempt to load the supabase-js ESM bundle and create a client. This is non-breaking
// and optional: if not provided, localStorage-only behavior remains.
async function initSupabaseClientAndTest() {
    if (!window.SUPABASE_URL || !window.SUPABASE_KEY) {
        console.info('Supabase config not provided; skipping Supabase initialization.');
        return null;
    }

    try {
        // Expect UMD bundle to be loaded and provide window.supabase.createClient
        let createClient = null;
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            createClient = window.supabase.createClient;
        } else if (typeof window.createClient === 'function') {
            createClient = window.createClient;
        } else {
            console.warn('Supabase UMD not found on window. Ensure CDN script is included.');
            setSupabaseStatus('SDK読み込み失敗');
            return null;
        }

        const supabaseClient = createClient(window.SUPABASE_URL, window.SUPABASE_KEY, { auth: { persistSession: true } });
        window.supabaseClient = supabaseClient;

        // Connection test: attempt a lightweight select on statistics (may be restricted by RLS)
        try {
            const { data, error } = await supabaseClient.from('statistics').select('id').limit(1);
            if (error) {
                // Not fatal — could be RLS/permission error; surface to console and UI
                console.warn('Supabase select test returned error (may be RLS or missing auth):', error);
                setSupabaseStatus('接続(制限あり)');
            } else {
                console.info('Supabase connection OK');
                setSupabaseStatus('接続OK');
            }
        } catch (e) {
            console.warn('Supabase selection test failed:', e);
            setSupabaseStatus('接続エラー');
        }

        return supabaseClient;
    } catch (err) {
        console.error('Failed to init supabase client:', err);
        try { setSupabaseStatus('SDK読み込み失敗'); } catch(e){}
        return null;
    }
}

function setSupabaseStatus(text) {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = text;
}


// =============================================================================
// StorageManager — データ管理 & localStorage
// =============================================================================

const StorageManager = {

    /**
     * デフォルトの学習データ構造
     * @returns {object}
     */
    createDefaultData() {
        return {
            totalCorrect: 0,
            totalWrong: 0,
            streak: 0,
            lastStudyDate: null,
            wordStats: {},
            dailyHistory: {}
        };
    },

    /**
     * localStorage から学習データを読み込む
     * 旧形式（correctWords / wrongWords）からの移行も行う
     * @returns {object}
     */
    load() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                const data = JSON.parse(raw) || {};
                // wordStats が存在しない場合は補完
                if (!data.wordStats || typeof data.wordStats !== 'object') {
                    data.wordStats = {};
                }
                // 新しいプロパティが追加された場合に備えて、デフォルト値で補完
                for (const key in data.wordStats) {
                    this.ensureWordStat(data, key);
                }
                // 他のトップレベルプロパティも補完
                data.totalCorrect = typeof data.totalCorrect === 'number' ? data.totalCorrect : 0;
                data.totalWrong = typeof data.totalWrong === 'number' ? data.totalWrong : 0;
                data.streak = typeof data.streak === 'number' ? data.streak : 0;
                data.lastStudyDate = data.lastStudyDate || null;
                data.dailyHistory = data.dailyHistory || {};

                return data;
            } catch (e) {
                console.error("Error parsing localStorage data, resetting:", e);
                // JSON破損時はバックアップを試みるかクリアする
                try { localStorage.removeItem(STORAGE_KEY); } catch (ex) { /* ignore */ }
            }
        }

        const data = this.createDefaultData();
        this.migrateLegacyData(data);
        this.save(data);
        return data;
    },


    /**
     * 旧 localStorage 形式から新形式へ移行
     * @param {object} data
     */
    migrateLegacyData(data) {
        // 旧形式のデータが存在するか確認し、存在すれば移行
        const legacyCorrectRaw = localStorage.getItem("correctWords");
        const legacyWrongRaw = localStorage.getItem("wrongWords");

        let legacyCorrect = [];
        if (legacyCorrectRaw) {
            try {
                legacyCorrect = JSON.parse(legacyCorrectRaw);
            } catch (e) {
                console.warn("Error parsing legacy correctWords data:", e);
            }
        }

        let legacyWrong = [];
        if (legacyWrongRaw) {
            try {
                legacyWrong = JSON.parse(legacyWrongRaw);
            } catch (e) {
                console.warn("Error parsing legacy wrongWords data:", e);
            }
        }

        legacyCorrect.forEach(word => {
            this.ensureWordStat(data, word.english);
            const stat = data.wordStats[word.english];
            if (stat.consecutiveCorrect < WEAK_WORD_GRADUATE_COUNT) {
                stat.consecutiveCorrect = WEAK_WORD_GRADUATE_COUNT;
            }
            stat.isWeak = false;
        });

        legacyWrong.forEach(word => {
            this.ensureWordStat(data, word.english);
            const stat = data.wordStats[word.english];
            stat.isWeak = true;
            stat.consecutiveCorrect = 0;
        });

        // 移行が完了したら古いキーを削除
        if (legacyCorrectRaw) localStorage.removeItem("correctWords");
        if (legacyWrongRaw) localStorage.removeItem("wrongWords");
    },

    /**
     * localStorage へ保存
     * @param {object} data
     */
    save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    /**
     * 単語統計エントリを確保（なければ初期化）
     * @param {object} data
     * @param {string} englishKey
     */
    ensureWordStat(data, englishKey) {
        if (!data.wordStats[englishKey]) {
            data.wordStats[englishKey] = {
                correct: 0,
                wrong: 0,
                consecutiveCorrect: 0,
                isWeak: false,
                isFavorite: false // お気に入りフラグを追加
            };
        } else {
            // 既存のデータにisFavoriteがない場合のために追加
            if (typeof data.wordStats[englishKey].isFavorite === 'undefined') {
                data.wordStats[englishKey].isFavorite = false;
            }
        }
    },

    /**
     * 今日の日付キー（YYYY-MM-DD）
     * @returns {string}
     */
    todayKey() {
        return new Date().toISOString().slice(0, 10);
    },

    /**
     * 日次履歴エントリを確保
     * @param {object} data
     * @param {string} dateKey
     */
    ensureDailyHistory(data, dateKey) {
        if (!data.dailyHistory[dateKey]) {
            data.dailyHistory[dateKey] = {
                correct: 0,
                wrong: 0,
                studyTimeSeconds: 0
            };
        }
    },

    /**
     * 正解を記録
     * @param {object} data
     * @param {object} word
     */
    recordCorrect(data, word) {
        const key = word.english;
        this.ensureWordStat(data, key);

        const stat = data.wordStats[key];
        stat.correct++;
        stat.consecutiveCorrect++;

        if (stat.isWeak && stat.consecutiveCorrect >= WEAK_WORD_GRADUATE_COUNT) {
            stat.isWeak = false;
        }

        data.totalCorrect++;
        data.streak++;
        data.lastStudyDate = this.todayKey();

        const dateKey = this.todayKey();
        this.ensureDailyHistory(data, dateKey);
        data.dailyHistory[dateKey].correct++;

        this.save(data);

        // 非同期で Supabase に保存を試みる（失敗してもアプリは継続）
        if (typeof this.saveWordStatRemote === 'function') {
            this.saveWordStatRemote(key, 1, 0).catch(e => console.warn('Remote saveWordStat failed (correct):', e));
        }
    },


    /**
     * 不正解を記録
     * @param {object} data
     * @param {object} word
     */
    recordWrong(data, word) {
        const key = word.english;
        this.ensureWordStat(data, key);

        const stat = data.wordStats[key];
        stat.wrong++;
        stat.consecutiveCorrect = 0;
        stat.isWeak = true;

        data.totalWrong++;
        data.streak = 0;
        data.lastStudyDate = this.todayKey();

        const dateKey = this.todayKey();
        this.ensureDailyHistory(data, dateKey);
        data.dailyHistory[dateKey].wrong++;

        this.save(data);

        // 非同期で Supabase に保存を試みる（失敗してもアプリは継続）
        if (typeof this.saveWordStatRemote === 'function') {
            this.saveWordStatRemote(key, 0, 1).catch(e => console.warn('Remote saveWordStat failed (wrong):', e));
        }
    },


    /**
     * 学習時間を加算（秒）
     * @param {object} data
     * @param {number} seconds
     */
    addStudyTime(data, seconds) {
        const dateKey = this.todayKey();
        this.ensureDailyHistory(data, dateKey);
        data.dailyHistory[dateKey].studyTimeSeconds += seconds;
        this.save(data);
    },

    /**
     * 単語統計を Supabase の word_stats テーブルへ非同期で保存する（失敗しても例外を投げない）
     * インクリメント方式で correct_count / wrong_count を更新する
     * @param {string} englishKey
     * @param {number} deltaCorrect
     * @param {number} deltaWrong
     */
    async saveWordStatRemote(englishKey, deltaCorrect = 0, deltaWrong = 0) {
        try {
            const client = window.supabaseClient;
            if (!client) {
                // Supabase クライアント未設定なら何もしない
                return;
            }

            const userId = 'nao'; // 固定ユーザー

            // 既存エントリを取得（存在すれば更新、なければ挿入）
            const { data, error } = await client
                .from('word_stats')
                .select('id, correct_count, wrong_count')
                .eq('user_id', userId)
                .eq('word', englishKey)
                .limit(1);

            if (error) {
                console.warn('Supabase select error for word_stats:', error);
                return;
            }

            const existing = (Array.isArray(data) && data.length > 0) ? data[0] : null;
            if (existing) {
                const newCorrect = (existing.correct_count || 0) + (deltaCorrect || 0);
                const newWrong = (existing.wrong_count || 0) + (deltaWrong || 0);
                const { error: upErr } = await client
                    .from('word_stats')
                    .update({ correct_count: newCorrect, wrong_count: newWrong })
                    .eq('id', existing.id);
                if (upErr) console.warn('Supabase update error for word_stats:', upErr);
            } else {
                const row = {
                    user_id: userId,
                    word: englishKey,
                    correct_count: deltaCorrect || 0,
                    wrong_count: deltaWrong || 0
                };
                const { error: insErr } = await client.from('word_stats').insert(row);
                if (insErr) console.warn('Supabase insert error for word_stats:', insErr);
            }
        } catch (e) {
            console.warn('saveWordStatRemote failed:', e);
        }
    },

    /**
     * 起動時に Supabase の word_stats を取得して localStorage の storageData に反映する
     * Supabase 側のデータを優先して上書きする
     */
    async syncWordStatsFromSupabase() {
        try {
            const client = window.supabaseClient;
            if (!client) {
                return; // Supabase 未利用
            }

            const userId = 'nao';
            const { data, error } = await client
                .from('word_stats')
                .select('word, correct_count, wrong_count')
                .eq('user_id', userId);

            if (error) {
                console.warn('Supabase select error when syncing word_stats:', error);
                return;
            }

            if (!Array.isArray(data) || data.length === 0) {
                console.info('No remote word_stats rows to sync');
                return;
            }

            // Ensure storageData is loaded
            if (!this.storageData) this.storageData = StorageManager.load();

            // Apply remote data (Supabase優先)
            data.forEach(row => {
                const key = row.word || '';
                if (!key) return;
                StorageManager.ensureWordStat(this.storageData, key);
                const stat = this.storageData.wordStats[key];
                stat.correct = Number(row.correct_count || 0);
                stat.wrong = Number(row.wrong_count || 0);
                // 保守的に consecutiveCorrect は保持しないで0にリセット
                stat.consecutiveCorrect = 0;
                // isWeak を判定する簡易ルール（誤答が正答を上回る場合を苦手とみなす）
                stat.isWeak = (stat.wrong > stat.correct);
            });

            // Recalculate aggregate totals
            let totalCorrect = 0;
            let totalWrong = 0;
            Object.values(this.storageData.wordStats).forEach(s => {
                totalCorrect += (Number(s.correct) || 0);
                totalWrong += (Number(s.wrong) || 0);
            });
            this.storageData.totalCorrect = totalCorrect;
            this.storageData.totalWrong = totalWrong;

            // Persist merged data locally
            StorageManager.save(this.storageData);

            // Update UI if ready
            try { UIManager.updateOverallStats(this.storageData); } catch (e) { /* ignore UI errors */ }

            console.info('Synced word_stats from Supabase:', data.length, 'rows');
        } catch (e) {
            console.warn('syncWordStatsFromSupabase failed:', e);
        }
    },


    /**
     * 苦手単語の数を取得
     * @param {object} data
     * @returns {number}
     */
    getWeakWordCount(data) {
        return Object.values(data.wordStats)
            .filter(stat => stat.isWeak).length;
    },

    /**
     * 正解済み単語の数（苦手でない単語）
     * @param {object} data
     * @returns {number}
     */
    getMasteredWordCount(data) {
        return Object.values(data.wordStats)
            .filter(stat => !stat.isWeak && stat.correct > 0).length;
    },

    /**
     * お気に入り単語の数を取得
     * @param {object} data
     * @returns {number}
     */
    getFavoriteWordCount(data) {
        return Object.values(data.wordStats)
            .filter(stat => stat.isFavorite).length;
    },

    /**
     * 単語のお気に入り状態を切り替える
     * @param {object} data
     * @param {string} englishKey
     * @returns {boolean} 新しいお気に入り状態
     */
    toggleFavorite(data, englishKey) {
        this.ensureWordStat(data, englishKey);
        const stat = data.wordStats[englishKey];
        stat.isFavorite = !stat.isFavorite;
        this.save(data);
        return stat.isFavorite;
    },

    /**
     * 単語がお気に入りかどうかを返す
     * @param {object} data
     * @param {string} englishKey
     * @returns {boolean}
     */
    isFavorite(data, englishKey) {
        this.ensureWordStat(data, englishKey);
        return data.wordStats[englishKey].isFavorite;
    }
};


// =============================================================================
// QuizManager — 出題管理
// =============================================================================

const QuizManager = {

    /**
     * 指定モードで単語リストをフィルタ
     * @param {Array} wordList
     * @param {object} storageData
     * @param {string} mode
     * @returns {Array}
     */
    filterWords(wordList, storageData, mode) {
        const sd = storageData || { wordStats: {} };
        const getKey = (w) => w.english || w.word || '';

        const list = wordList.filter(w => {
            const key = getKey(w);
            const stat = sd.wordStats && sd.wordStats[key] ? sd.wordStats[key] : { correct:0, wrong:0, isWeak:false, isFavorite:false };
            switch (mode) {
                case 'weak':
                    return !!stat.isWeak;
                case 'graduated':
                    return !stat.isWeak && (stat.correct > 0);
                case 'unlearned':
                    return (!sd.wordStats || !sd.wordStats[key] || (stat.correct === 0 && stat.wrong === 0));
                case 'favorite':
                    return !!stat.isFavorite;
                case 'random50':
                case 'random100':
                case 'all':
                default:
                    return true;
            }
        });

        // random modes: shuffle then slice
        if (mode === 'random50' || mode === 'random100') {
            const shuffled = [...list].sort(() => Math.random() - 0.5);
            const limit = mode === 'random50' ? 50 : 100;
            return shuffled.slice(0, Math.min(limit, shuffled.length));
        }

        return list;
    },

    /**
     * クイズ状態を初期化
     * @param {Array} wordList
     * @returns {object}
     */
    createState(wordList) {
        const shuffled = [...wordList].sort(() => Math.random() - 0.5);
        return {
            words: shuffled,
            currentIndex: 0,
            currentWord: null,
            direction: null,
            displayedMeaning: null,
            questionStartTime: null
        };
    },

    /**
     * ランダムな出題方向を決定
     * @returns {string}
     */
    randomDirection() {
        return Math.random() < 0.5
            ? Direction.EN_TO_JP
            : Direction.JP_TO_EN;
    },

    /**
     * 日本語文字列を複数の意味に分割
     * @param {string} japanese
     * @returns {string[]}
     */
    splitMeanings(japanese) {
        return japanese
            .split(JAPANESE_DELIMITERS)
            .map(m => m.trim())
            .filter(m => m.length > 0);
    },

    /**
     * 問題文テキストを取得
     * @param {object} state
     * @returns {string}
     */
    getQuestionText(state) {
        if (state.direction === Direction.EN_TO_JP) {
            return state.currentWord.english;
        }
        return state.displayedMeaning;
    },

    /**
     * 正解表示用テキストを取得
     * @param {object} state
     * @returns {string}
     */
    getCorrectAnswerText(state) {
        if (state.direction === Direction.EN_TO_JP) {
            return state.currentWord.japanese;
        }
        return state.currentWord.english;
    },

    /**
     * 出題方向の表示ラベル
     * @param {string} direction
     * @returns {string}
     */
    getDirectionLabel(direction) {
        return direction === Direction.EN_TO_JP
            ? "英語 → 日本語"
            : "日本語 → 英語";
    },

    /**
     * 次の問題をセットアップ
     * @param {object} state
     * @returns {boolean} 問題がある場合 true
     */
    setupNextQuestion(state) {
        if (state.currentIndex >= state.words.length) {
            return false;
        }

        state.currentWord = state.words[state.currentIndex];
        state.direction = this.randomDirection();
        state.questionStartTime = Date.now();

        if (state.direction === Direction.JP_TO_EN) {
            const meanings = this.splitMeanings(state.currentWord.japanese);
            state.displayedMeaning =
                meanings[Math.floor(Math.random() * meanings.length)];
        } else {
            state.displayedMeaning = null;
        }

        return true;
    },

    /**
     * 問題を進める
     * @param {object} state
     */
    advance(state) {
        state.currentIndex++;
    },

    /**
     * クイズ終了判定
     * @param {object} state
     * @returns {boolean}
     */
    isFinished(state) {
        return state.currentIndex >= state.words.length;
    }
};


// =============================================================================
// AnswerChecker — 回答判定
// =============================================================================

const AnswerChecker = {

    /**
     * ユーザー回答が正解か判定
     * @param {string} userInput
     * @param {object} state
     * @returns {boolean}
     */
    isCorrect(userInput, state) {
        // 正規化ユーティリティ
        const normalize = (s) => {
            if (!s && s !== "") return "";
            try {
                // 全角→半角や合字の正規化、余分な空白削除
                return String(s).normalize('NFKC').trim().replace(/\s+/g, ' ');
            } catch (e) {
                return String(s).trim();
            }
        };

        const inputRaw = normalize(userInput);
        if (!inputRaw) return false;

        // 現在の単語オブジェクトから候補を取り出すユーティリティ
        const getJapaneseCandidates = (wordObj) => {
            const candidates = [];
            if (wordObj) {
                if (typeof wordObj.japanese === 'string' && wordObj.japanese.length) {
                    const splitted = QuizManager.splitMeanings(wordObj.japanese);
                    splitted.forEach(m => candidates.push(normalize(m).replace(/^〜/, '')));
                }
                if (Array.isArray(wordObj.answers)) {
                    wordObj.answers.forEach(a => candidates.push(normalize(a)));
                }
            }
            return candidates.map(c => c);
        };

        const getEnglishCandidates = (wordObj) => {
            const candidates = [];
            if (wordObj) {
                if (typeof wordObj.english === 'string' && wordObj.english.length) {
                    candidates.push(normalize(wordObj.english).toLowerCase());
                }
                if (typeof wordObj.word === 'string' && wordObj.word.length) {
                    candidates.push(normalize(wordObj.word).toLowerCase());
                }
                if (Array.isArray(wordObj.answers)) {
                    wordObj.answers.forEach(a => candidates.push(normalize(a).toLowerCase()));
                }
            }
            return candidates;
        };

        if (state.direction === Direction.EN_TO_JP) {
            const user = normalize(inputRaw);
            const candidates = getJapaneseCandidates(state.currentWord);
            // 正確な一致だけでなく、句点や括弧の違いを吸収して比較
            for (const c of candidates) {
                if (!c) continue;
                if (user === c) return true;
                // カッコやピリオドを除去して比較
                const strippedUser = user.replace(/[\p{P}\p{S}]+/gu, '').trim();
                const strippedC = c.replace(/[\p{P}\p{S}]+/gu, '').trim();
                if (strippedUser === strippedC) return true;
            }
            return false;
        }

        // JP_TO_EN
        const userLower = normalize(inputRaw).toLowerCase();
        const engCandidates = getEnglishCandidates(state.currentWord);
        for (const c of engCandidates) {
            if (!c) continue;
            if (userLower === c) return true;
            // 比較のゆらぎを吸収（ピリオドやスペース違いなど）
            const strippedUser = userLower.replace(/[\p{P}\p{S}]+/gu, '').replace(/\s+/g, '');
            const strippedC = c.replace(/[\p{P}\p{S}]+/gu, '').replace(/\s+/g, '');
            if (strippedUser === strippedC) return true;
        }

        return false;
    }
};


// =============================================================================
// TimerManager — タイマー
// =============================================================================

const TimerManager = {

    intervalId: null,
    timeLeft: TIMER_SECONDS,
    onTimeout: null,

    /**
     * タイマーを開始
     * @param {function} onTick - 残り秒数コールバック
     * @param {function} onTimeout - 時間切れコールバック
     */
    start(onTick, onTimeout, initialSeconds) {
        // initialSeconds が指定されていればそれを使い、そうでなければデフォルトにリセット
        this.stop();
        this.timeLeft = (typeof initialSeconds === 'number' && initialSeconds > 0) ? Math.floor(initialSeconds) : TIMER_SECONDS;
        this.onTimeout = onTimeout;
        onTick(this.timeLeft);

        this.intervalId = setInterval(() => {
            this.timeLeft--;
            onTick(this.timeLeft);

            if (this.timeLeft <= 0) {
                this.stop();
                if (this.onTimeout) {
                    this.onTimeout();
                }
            }
        }, 1000);
    },

    /**
     * 現在の残り秒数を返す（テストや外部からの参照用）
     */
    getTimeLeft() {
        return this.timeLeft;
    },


    /**
     * タイマーを停止
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
};


// =============================================================================
// UIManager — UI 更新
// =============================================================================

const UIManager = {

    elements: {},
    statsElements: {},

    /**
     * DOM 要素をキャッシュ
     */
    init() {
        this.elements = {
            question: document.getElementById("question"),
            answer: document.getElementById("answer"),
            result: document.getElementById("result"),
            timer: document.getElementById("timer"),
            correctCount: document.getElementById("correctCount"),
            wrongCount: document.getElementById("wrongCount"),
            accuracy: document.getElementById("accuracy"),
            submitButton: document.getElementById("submit"),
            currentNumber: document.getElementById("currentNumber"),
            totalNumber: document.getElementById("totalNumber"),
            direction: document.getElementById("direction"),
            favoriteButton: document.getElementById("favoriteBtn"), // お気に入りボタンを追加
            quizMode: document.getElementById('quizMode')
        };

        // 必須要素のnullチェック
        for (const key in this.elements) {
            if (this.elements[key] === null) {
                console.warn(`UI Element with ID \'${key}\' not found. Some features may not work.`);
            }
        }
    },

    /**
     * 統計パネル関連のDOM要素をキャッシュし、イベントリスナーを設定
     * 統計パネルが存在しない場合でもエラーにならないようにする
     */
    initStatsPanel() {
        this.statsElements = {
            statsBtn: document.getElementById("statsBtn"),
            statsPanel: document.getElementById("statsPanel"),
            statsPanelClose: document.getElementById("statsPanelClose"),
            // 必要に応じて統計パネル内の他の要素もここに追加
            totalCorrectStat: document.getElementById("totalCorrectStat"),
            totalWrongStat: document.getElementById("totalWrongStat"),
            masteredWordsStat: document.getElementById("masteredWordsStat"),
            weakWordsStat: document.getElementById("weakWordsStat"),
            favoriteWordsStat: document.getElementById("favoriteWordsStat"), // お気に入り単語数表示要素
            streakStat: document.getElementById("streakStat"),
            lastStudyDateStat: document.getElementById("lastStudyDateStat"),
            todayCorrectStat: document.getElementById("todayCorrectStat"),
            todayWrongStat: document.getElementById("todayWrongStat"),
            todayStudyTimeStat: document.getElementById("todayStudyTimeStat"),
        };

        const { statsBtn, statsPanel, statsPanelClose } = this.statsElements;
        // 追加でソートセレクトとテーブル本体を参照
        this.statsElements.statsSort = document.getElementById('statsSort');
        this.statsElements.statsTableBody = document.getElementById('statsTableBody');

        // 統計パネル関連の要素が全て存在する場合のみイベントを設定
        if (statsBtn && statsPanel && statsPanelClose) {
            // 開く — 開いた時点でテーブルを再描画する
            statsBtn.addEventListener("click", () => {
                // 描画前に最新データで埋める
                this.renderStatsTable(App.storageData, (typeof words !== 'undefined') ? words : []);
                statsPanel.classList.remove("hidden");
            });

            // 閉じるボタン
            statsPanelClose.addEventListener("click", () => {
                statsPanel.classList.add("hidden");
            });

            // 外側クリック
            statsPanel.addEventListener("click", (e) => {
                if (e.target === statsPanel) {
                    statsPanel.classList.add("hidden");
                }
            });

            // ESCキー
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && !statsPanel.classList.contains("hidden")) {
                    statsPanel.classList.add("hidden");
                }
            });

            // ソート変更で再描画
            if (this.statsElements.statsSort) {
                this.statsElements.statsSort.addEventListener('change', () => {
                    this.renderStatsTable(App.storageData, (typeof words !== 'undefined') ? words : []);
                });
            }

            // 統計テーブル内のお気に入り列クリックでトグルする（イベント委譲）
            if (this.statsElements.statsTableBody) {
                this.statsElements.statsTableBody.addEventListener('click', (e) => {
                    const td = e.target.closest && e.target.closest('td.col-fav');
                    if (!td) return;
                    const tr = td.closest('tr');
                    if (!tr) return;
                    const key = tr.dataset && tr.dataset.key;
                    if (!key) return;

                    const newState = StorageManager.toggleFavorite(App.storageData, key);
                    // 再描画
                    this.renderStatsTable(App.storageData, (typeof words !== 'undefined') ? words : []);
                    this.updateOverallStats(App.storageData);
                });
            }
        } else {
            console.info("Stats panel elements not found. Stats panel functionality will be disabled.");
        }
    },


    /**
     * 単語ごとの統計テーブルを描画
     * @param {object} storageData
     * @param {Array} wordList
     */
    renderStatsTable(storageData, wordList) {
        const tbody = this.statsElements.statsTableBody;
        if (!tbody) return;

        // Build rows: combine wordList and storageData.wordStats
        const rows = wordList.map(w => {
            const key = w.english || w.word || '';
            const stat = (storageData && storageData.wordStats && storageData.wordStats[key]) || { correct:0, wrong:0, consecutiveCorrect:0, isFavorite:false };
            const total = stat.correct + stat.wrong;
            const accuracy = total ? (stat.correct / total * 100) : 0;
            return {
                english: w.english || w.word || '',
                japanese: w.japanese || (Array.isArray(w.answers) ? w.answers.join(', ') : ''),
                correct: stat.correct || 0,
                wrong: stat.wrong || 0,
                accuracy: accuracy,
                avgTime: stat.avgTime || null,
                favorite: !!stat.isFavorite
            };
        });

        // ソート
        const sortMode = (this.statsElements.statsSort && this.statsElements.statsSort.value) || 'accuracyAsc';
        if (sortMode === 'accuracyAsc') {
            rows.sort((a,b) => a.accuracy - b.accuracy);
        } else if (sortMode === 'wrongDesc') {
            rows.sort((a,b) => b.wrong - a.wrong);
        } else if (sortMode === 'timeDesc') {
            rows.sort((a,b) => (b.avgTime || 0) - (a.avgTime || 0));
        }

        // 描画
        tbody.innerHTML = '';
        for (const r of rows) {
            const tr = document.createElement('tr');
            // データ属性にキーを付与（クリックで切替を行うため）
            tr.dataset.key = r.english || '';

            const tdEng = document.createElement('td'); tdEng.textContent = r.english; tr.appendChild(tdEng);
            const tdJp = document.createElement('td'); tdJp.textContent = r.japanese; tr.appendChild(tdJp);
            const tdAcc = document.createElement('td'); tdAcc.textContent = (r.accuracy).toFixed(1) + '%'; tr.appendChild(tdAcc);
            const tdC = document.createElement('td'); tdC.textContent = r.correct; tr.appendChild(tdC);
            const tdW = document.createElement('td'); tdW.textContent = r.wrong; tr.appendChild(tdW);
            const tdT = document.createElement('td'); tdT.textContent = r.avgTime ? r.avgTime + 's' : 'N/A'; tr.appendChild(tdT);
            const tdFav = document.createElement('td'); tdFav.className = 'col-fav'; tdFav.textContent = r.favorite ? '★' : '☆';
            tdFav.title = 'クリックでお気に入り切替';
            tdFav.setAttribute('role', 'button');
            tr.appendChild(tdFav);

            tbody.appendChild(tr);
        }
    },


    /**
     * セッション成績を更新
     * @param {object} sessionStats - { correct: number, wrong: number }
     */
    updateStats(sessionStats) {
        const { correct, wrong } = sessionStats;

        if (this.elements.correctCount) this.elements.correctCount.textContent = correct;
        if (this.elements.wrongCount) this.elements.wrongCount.textContent = wrong;

        const total = correct + wrong;

        if (this.elements.accuracy) {
            this.elements.accuracy.textContent =
                total
                    ? (correct / total * 100).toFixed(1) + "%"
                    : "0%";
        }
    },

    /**
     * 全体統計を更新（統計パネル用）
     * @param {object} storageData
     */
    updateOverallStats(storageData) {
        const { totalCorrectStat, totalWrongStat, masteredWordsStat, weakWordsStat, favoriteWordsStat, streakStat, lastStudyDateStat, todayCorrectStat, todayWrongStat, todayStudyTimeStat } = this.statsElements;

        if (totalCorrectStat) totalCorrectStat.textContent = storageData.totalCorrect;
        if (totalWrongStat) totalWrongStat.textContent = storageData.totalWrong;
        if (masteredWordsStat) masteredWordsStat.textContent = StorageManager.getMasteredWordCount(storageData);
        if (weakWordsStat) weakWordsStat.textContent = StorageManager.getWeakWordCount(storageData);
        if (favoriteWordsStat) favoriteWordsStat.textContent = StorageManager.getFavoriteWordCount(storageData); // お気に入り単語数を更新
        if (streakStat) streakStat.textContent = storageData.streak;
        if (lastStudyDateStat) lastStudyDateStat.textContent = storageData.lastStudyDate || "N/A";

        const todayKey = StorageManager.todayKey();
        const todayStats = storageData.dailyHistory[todayKey] || { correct: 0, wrong: 0, studyTimeSeconds: 0 };

        if (todayCorrectStat) todayCorrectStat.textContent = todayStats.correct;
        if (todayWrongStat) todayWrongStat.textContent = todayStats.wrong;
        if (todayStudyTimeStat) {
            const minutes = Math.floor(todayStats.studyTimeSeconds / 60);
            const seconds = todayStats.studyTimeSeconds % 60;
            todayStudyTimeStat.textContent = `${minutes}分${seconds}秒`;
        }

        // 統計テーブルが存在すれば再描画
        if (this.statsElements && this.statsElements.statsTableBody) {
            this.renderStatsTable(storageData, (typeof words !== 'undefined') ? words : []);
        }
    },

    /**
     * 問題番号・総数を更新
     * @param {number} current
     * @param {number} total
     */
    updateProgress(current, total) {
        if (this.elements.currentNumber) this.elements.currentNumber.textContent = current;
        if (this.elements.totalNumber) this.elements.totalNumber.textContent = total;
    },

    /**
     * 出題方向ラベルを更新
     * @param {string} label
     */
    updateDirection(label) {
        if (this.elements.direction) this.elements.direction.textContent = label;
    },

    /**
     * 残り時間を更新
     * @param {number} seconds
     */
    updateTimer(seconds) {
        if (this.elements.timer) this.elements.timer.textContent = seconds;
    },

    /**
     * 問題表示を更新
     * @param {string} text
     * @param {string} direction
     */
    showQuestion(text, direction) {
        if (this.elements.question) this.elements.question.textContent = text;

        // Ensure input and buttons are visible/enabled when showing a new question
        if (this.elements.answer) {
            this.elements.answer.style.display = '';
            this.elements.answer.value = "";
            this.elements.answer.disabled = false;
            this.elements.answer.placeholder =
                direction === Direction.EN_TO_JP
                    ? "意味を入力"
                    : "英語を入力";
            try { this.elements.answer.focus(); } catch (e) { /* ignore focus errors */ }
        }

        if (this.elements.submitButton) this.elements.submitButton.style.display = '';
        if (this.elements.favoriteButton) this.elements.favoriteButton.style.display = '';

        if (this.elements.result) this.elements.result.textContent = "";

        // Ensure the question/answer area is visible — scroll into view centered to avoid being under browser UI
        try {
            const el = this.elements.answer || this.elements.question || document.querySelector('.container');
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (e) {
            // ignore scrolling errors
        }
    },



    /**
     * 正解メッセージ
     */
    showCorrect() {
        if (this.elements.result) this.elements.result.textContent = "〇 正解";
    },

    /**
     * 不正解メッセージ
     * @param {string} correctText
     */
    showWrong(correctText) {
        if (this.elements.result) {
            this.elements.result.textContent =
                "× 正解：" + correctText;
        }
    },

    /**
     * 時間切れメッセージ
     * @param {string} correctText
     */
    showTimeout(correctText) {
        if (this.elements.result) {
            this.elements.result.textContent =
                "時間切れ！\n正解：" + correctText;
        }
    },

    /**
     * 入力を無効化
     */
    disableInput() {
        if (this.elements.answer) this.elements.answer.disabled = true;
    },

    /**
     * お気に入りボタンの状態を更新
     * @param {boolean} isFavorite
     */
    updateFavoriteButton(isFavorite) {
        if (this.elements.favoriteButton) {
            if (isFavorite) {
                this.elements.favoriteButton.classList.add("is-favorite");
                this.elements.favoriteButton.textContent = "★";
                this.elements.favoriteButton.setAttribute('aria-pressed', 'true');
            } else {
                this.elements.favoriteButton.classList.remove("is-favorite");
                this.elements.favoriteButton.textContent = "☆";
                this.elements.favoriteButton.setAttribute('aria-pressed', 'false');
            }
        }
    },


    /**
     * 終了画面を表示
     * @param {object} sessionStats
     * @param {object} storageData
     */
    showFinish(sessionStats, storageData) {
        if (this.elements.question) this.elements.question.textContent = "終了！";
        if (this.elements.timer) this.elements.timer.textContent = "0";
        if (this.elements.direction) this.elements.direction.textContent = "—";
        if (this.elements.answer) this.elements.answer.style.display = "none";
        if (this.elements.submitButton) this.elements.submitButton.style.display = "none";
        if (this.elements.favoriteButton) this.elements.favoriteButton.style.display = "none"; // お気に入りボタンも非表示に

        const total = sessionStats.correct + sessionStats.wrong;
        const rate = total === 0
            ? 0
            : (sessionStats.correct / total * 100).toFixed(1);

        if (this.elements.result) {
            this.elements.result.innerHTML = `
                <h2>結果</h2>
                <p>正解：${sessionStats.correct}</p>
                <p>不正解：${sessionStats.wrong}</p>
                <p>正答率：${rate}%</p>
                <br>
                <p>正解単語保存数：${StorageManager.getMasteredWordCount(storageData)}</p>
                <p>苦手単語保存数：${StorageManager.getWeakWordCount(storageData)}</p>
                <p>お気に入り単語数：${StorageManager.getFavoriteWordCount(storageData)}</p>
                <div style="text-align:center; margin-top:12px;">
                    <button id="retryModeBtn" type="button">このモードを再度実施</button>
                </div>
            `;
        }
    },

    /**
     * スキップ時の表示
     * @param {string} correctText
     */
    showSkip(correctText) {
        if (this.elements.result) {
            this.elements.result.textContent = `スキップしました。 正解：${correctText}`;
        }
    },

    /**
     * フィルタに当てはまる単語が存在しないときに表示するメッセージ
     * @param {string} message
     */
    showNoWords(message) {
        if (this.elements.question) this.elements.question.textContent = message || '該当する単語がありません。';
        if (this.elements.direction) this.elements.direction.textContent = '—';
        if (this.elements.answer) {
            this.elements.answer.style.display = 'none';
            this.elements.answer.disabled = true;
        }
        if (this.elements.submitButton) this.elements.submitButton.style.display = 'none';
        if (this.elements.favoriteButton) this.elements.favoriteButton.style.display = 'none';
        if (this.elements.timer) this.elements.timer.textContent = '';
        if (this.elements.result) this.elements.result.textContent = '';
    }
};


// =============================================================================
// App — 全体制御
// =============================================================================

const App = {

    storageData: null,
    quizState: null,
    sessionStats: { correct: 0, wrong: 0 },
    isAnswering: false,

    /**
     * Supabaseからwordsテーブルを取得してwindow.wordsを置き換える（失敗時は既存を保持）
     * 非破壊で動作するように設計
     */
    async fetchWordsFromSupabase() {
        try {
            let client = window.supabaseClient || null;
            if (!client && window.supabase && typeof window.supabase.createClient === 'function' && window.SUPABASE_URL && window.SUPABASE_KEY) {
                client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY, { auth: { persistSession: true } });
                window.supabaseClient = client;
            }
            if (!client) {
                // Supabase 未初期化
                return false;
            }

            const { data, error } = await client.from('words').select('english, japanese');
            if (error) {
                console.warn('Supabase words select error:', error);
                return false;
            }
            if (!Array.isArray(data) || data.length === 0) {
                console.info('Supabase words table empty or no rows returned');
                return false;
            }

            // Map rows to expected shape
            const mapped = data.map(r => ({ english: r.english || r.word || '', japanese: r.japanese || (r.answers ? (Array.isArray(r.answers) ? r.answers.join(', ') : r.answers) : '') }));
            // Replace global words only if mapped has at least one valid entry
            const valid = mapped.filter(w => w.english && w.japanese);
            if (valid.length > 0) {
                window.words = mapped;
                console.info('Loaded words from Supabase:', mapped.length);
                return true;
            }
            return false;
        } catch (e) {
            console.warn('Failed to fetch words from Supabase:', e);
            return false;
        }
    },

    /**
     * アプリ初期化
     */
    async init() {
        UIManager.init();
        UIManager.initStatsPanel(); // UIManagerのメソッドを直接呼び出す

        // Supabase 初期化を試みる（なければスキップ）。ここでは完了を待ってから続行して同期を確実に行う
        try {
            const client = await initSupabaseClientAndTest();
            if (client) {
                console.info('Supabase client initialized (awaited)');
                window.supabaseClient = client;
            } else {
                console.info('Supabase client not initialized; proceeding with local-only mode');
            }
        } catch (e) { console.warn('Supabase init error', e); }

        // Try to fetch words from Supabase before proceeding. If it fails, fallback to local words.js
        try {
            await this.fetchWordsFromSupabase();
        } catch (e) { /* ignore fetch errors and proceed with local words */ }

        this.storageData = StorageManager.load();

        // Supabase側のword_statsがあればローカルに同期（Supabase優先）
        try {
            await this.syncWordStatsFromSupabase();
        } catch (e) {
            console.warn('syncWordStatsFromSupabase failed:', e);
        }

        // words配列の存在チェック
        if (typeof words === 'undefined' || !Array.isArray(words) || words.length === 0) {
            console.error("Error: 'words' array is not defined or empty. Please ensure words.js is loaded correctly and contains vocabulary data.");
            // UIにエラーメッセージを表示するなど、ユーザーへのフィードバックを追加することも可能
            if (UIManager.elements.question) UIManager.elements.question.textContent = "エラー: 単語データが読み込めません。words.jsを確認してください。";
            if (UIManager.elements.answer) UIManager.elements.answer.disabled = true;
            if (UIManager.elements.submitButton) UIManager.elements.submitButton.disabled = true;
            if (UIManager.elements.favoriteButton) UIManager.elements.favoriteButton.style.display = "none"; // お気に入りボタンも非表示に
            return; // アプリの初期化を停止
        }

        // storageData にすべての単語キーが存在するか補完（表示や統計でundefinedを避ける）
        try {
            words.forEach(w => {
                const key = w.english || w.word;
                if (key) StorageManager.ensureWordStat(this.storageData, key);
            });
            // 保存しておく
            StorageManager.save(this.storageData);
        } catch (e) {
            console.warn('Warning while ensuring word stats:', e);
        }

        // 初期クイズを作成（default: quizMode の選択を反映）
        const modeSelect = document.getElementById('quizMode');
        const initialMode = (modeSelect && modeSelect.value) || 'all';
        this.startNewQuiz(initialMode);

        UIManager.updateStats(this.sessionStats); // オブジェクトを渡すように修正
        const total = this.quizState && this.quizState.words ? this.quizState.words.length : 0;
        const current = (total > 0) ? (this.quizState.currentIndex + 1) : 0;
        UIManager.updateProgress(current, total);
        UIManager.updateOverallStats(this.storageData); // 統計パネルの初期表示

        this.bindEvents();
        this.startQuestion();
    },

     /**
      * イベントリスナーを登録
      */
     bindEvents() {
         // typing pause settings
         this._typingTimeout = null;
         this._typingIdleMs = 2000; // ミリ秒: 入力停止後にタイマーを再開
         this._isComposing = false;

         if (UIManager.elements.answer) {
             UIManager.elements.answer.addEventListener("keydown", (e) => {
                 if (e.key === "Enter") {
                     this.handleAnswer();
                 }
             });

             // 入力にフォーカスしたらタイマーを停止（入力中はカウントダウンしない）
             UIManager.elements.answer.addEventListener('focus', () => {
                 if (this.isAnswering) return;
                 try {
                     // 記録用に一時停止時刻を保存
                     this._pauseTimestamp = Date.now();
                     TimerManager.stop();
                 } catch (e) { /* ignore */ }
             });

             // composition (IME) 開始/終了を扱う
             UIManager.elements.answer.addEventListener('compositionstart', () => {
                 this._isComposing = true;
                 if (this.isAnswering) return;
                 try {
                     this._pauseTimestamp = this._pauseTimestamp || Date.now();
                     TimerManager.stop();
                     this._clearTypingTimeout();
                 } catch (e) { /* ignore */ }
             });
             UIManager.elements.answer.addEventListener('compositionend', () => {
                 this._isComposing = false;
                 if (this.isAnswering) return;
                 // 入力確定後、アイドルを待って再開
                 this._pauseTimestamp = this._pauseTimestamp || Date.now();
                 this._scheduleResumeTimer();
             });

             // 実際の入力イベント（キー入力や貼り付け）でタイマーを停止し、入力が止まったら再開
             UIManager.elements.answer.addEventListener('input', () => {
                 if (this.isAnswering) return;
                 try {
                     // stop timer on any input and set pause timestamp if not set
                     this._pauseTimestamp = this._pauseTimestamp || Date.now();
                     TimerManager.stop();
                     // schedule resume after idle
                     this._scheduleResumeTimer();
                 } catch (e) { /* ignore */ }
             });

             // 入力からフォーカスが外れたら即座にタイマーを再開（残り時間を維持）
             UIManager.elements.answer.addEventListener('blur', () => {
                 if (this.isAnswering) return;
                 try {
                     // cancel any scheduled resume and resume immediately
                     this._clearTypingTimeout();
                     this._resumeTimerFromPause();
                 } catch (e) { /* ignore */ }
             });
         }

         if (UIManager.elements.submitButton) {
             UIManager.elements.submitButton.addEventListener("click", () => {
                 this.handleAnswer();
             });
         }

         // お気に入りボタンのイベントリスナー
         if (UIManager.elements.favoriteButton) {
             UIManager.elements.favoriteButton.addEventListener("click", () => {
                 this.handleFavoriteToggle();
             });
         }

         // クイズモード変更時は新しいモードで再スタート
         // UIManager may have cached quizMode; fallback to element lookup
         const modeEl = UIManager.elements.quizMode || document.getElementById('quizMode');
         if (modeEl) {
             modeEl.addEventListener('change', (e) => {
                 const mode = e.target.value;
                 this.startNewQuiz(mode);
             });
         }

         // エクスポートボタン
         const exportBtn = document.getElementById('exportBtn');
         if (exportBtn) {
             exportBtn.addEventListener('click', () => {
                 this.handleExport();
             });
         }

         // ESC押下でスキップ（統計パネルが開いている場合はそちらのハンドラに任せる）
         document.addEventListener('keydown', (e) => {
             if (e.key === 'Escape') {
                 const statsPanel = UIManager.statsElements && UIManager.statsElements.statsPanel;
                 if (statsPanel && !statsPanel.classList.contains('hidden')) {
                     // stats panel handler will close it; do nothing here
                     return;
                 }
                 // Skip current question if possible
                 this.handleSkip();
             }
         });
     },

     _clearTypingTimeout() {
         try {
             if (this._typingTimeout) {
                 clearTimeout(this._typingTimeout);
                 this._typingTimeout = null;
             }
         } catch (e) { /* ignore */ }
     },

     /**
      * スケジュールされた再開処理をセット
      */
     _scheduleResumeTimer() {
         this._clearTypingTimeout();
         this._typingTimeout = setTimeout(() => {
             this._typingTimeout = null;
             try {
                 this._resumeTimerFromPause();
             } catch (e) { /* ignore */ }
         }, this._typingIdleMs);
     },

     /**
      * ポーズ開始時刻から学習時間補正をしてタイマーを再開する
      */
     _resumeTimerFromPause() {
         try {
             if (this._pauseTimestamp && this.quizState && this.quizState.questionStartTime) {
                 const pausedDuration = Date.now() - this._pauseTimestamp;
                 this.quizState.questionStartTime += pausedDuration;
             }
             this._pauseTimestamp = null;

             const remaining = TimerManager.getTimeLeft();
             const startSeconds = (typeof remaining === 'number' && remaining > 0) ? remaining : TIMER_SECONDS;
             // only start if there's time left
             if (startSeconds > 0) {
                 TimerManager.start(
                     (seconds) => UIManager.updateTimer(seconds),
                     () => this.handleTimeout(),
                     startSeconds
                 );
             } else {
                 // no time left, call timeout immediately
                 setTimeout(() => this.handleTimeout(), 0);
             }
         } catch (e) { /* ignore */ }
     },


    /**
     * 問題開始
     */
    startQuestion() {
        this.isAnswering = false;

        const hasQuestion =
            QuizManager.setupNextQuestion(this.quizState);

        if (!hasQuestion) {
            this.finishQuiz();
            return;
        }

        const { currentIndex, direction, currentWord } = this.quizState;

        UIManager.updateProgress(
            currentIndex + 1,
            this.quizState.words.length
        );
        UIManager.updateDirection(
            QuizManager.getDirectionLabel(direction)
        );
        UIManager.showQuestion(
            QuizManager.getQuestionText(this.quizState),
            direction
        );

        // お気に入りボタンの状態を更新
        if (currentWord) {
            const isFavorite = StorageManager.isFavorite(this.storageData, currentWord.english);
            UIManager.updateFavoriteButton(isFavorite);
        }

        TimerManager.start(
            (seconds) => UIManager.updateTimer(seconds),
            () => this.handleTimeout()
        );
    },

    /**
     * 経過時間（秒）を学習履歴に加算
     */
    recordElapsedTime() {
        if (!this.quizState.questionStartTime) {
            return;
        }
        const elapsed = Math.round(
            (Date.now() - this.quizState.questionStartTime) / 1000
        );
        if (elapsed > 0) {
            StorageManager.addStudyTime(this.storageData, elapsed);
        }
        this.quizState.questionStartTime = null;
    },

    /**
     * 回答処理
     */
    handleAnswer() {
        if (this.isAnswering || (UIManager.elements.answer && UIManager.elements.answer.disabled)) {
            return;
        }

        this.isAnswering = true;
        TimerManager.stop();
        // clear any pause marker
        this._pauseTimestamp = null;
        // clear any scheduled typing resume
        try { this._clearTypingTimeout(); } catch (e) { /* ignore */ }
        this.recordElapsedTime();

        const userInput = UIManager.elements.answer ? UIManager.elements.answer.value : "";
        const isCorrect = AnswerChecker.isCorrect(
            userInput,
            this.quizState
        );
        const correctText =
            QuizManager.getCorrectAnswerText(this.quizState);

        if (isCorrect) {
            this.sessionStats.correct++;
            StorageManager.recordCorrect(
                this.storageData,
                this.quizState.currentWord
            );
            UIManager.showCorrect();
        } else {
            this.sessionStats.wrong++;
            StorageManager.recordWrong(
                this.storageData,
                this.quizState.currentWord
            );
            UIManager.showWrong(correctText);
        }

        UIManager.updateStats(this.sessionStats); // オブジェクトを渡すように修正
        UIManager.updateOverallStats(this.storageData); // 統計パネルの更新
        UIManager.disableInput();

        QuizManager.advance(this.quizState);

        setTimeout(() => {
            this.startQuestion();
        }, ANSWER_DELAY_MS);
    },

    /**
     * お気に入りボタンのトグル処理
     */
    handleFavoriteToggle() {
        if (!this.quizState || !this.quizState.currentWord) return;

        const englishKey = this.quizState.currentWord.english;
        const newFavoriteState = StorageManager.toggleFavorite(this.storageData, englishKey);
        UIManager.updateFavoriteButton(newFavoriteState);
        UIManager.updateOverallStats(this.storageData); // 統計パネルのお気に入り単語数を更新
    },

    /**
     * ESCやユーザー操作で現在の問題をスキップする
     * スキップは不正解にしない（統計は更新しない）
     */
    handleSkip() {
        // Cannot skip if already answering or no current word
        if (this.isAnswering) return;
        if (!this.quizState || !this.quizState.currentWord) return;

        this.isAnswering = true;
        TimerManager.stop();
        // clear any pause marker
        this._pauseTimestamp = null;
        // clear any scheduled typing resume
        try { this._clearTypingTimeout(); } catch (e) { /* ignore */ }
        this.recordElapsedTime();

        const correctText = QuizManager.getCorrectAnswerText(this.quizState);
        // Show skip message (no storage record)
        UIManager.showSkip(correctText);
        UIManager.disableInput();

        // advance and move to next question after short delay
        QuizManager.advance(this.quizState);
        setTimeout(() => {
            this.startQuestion();
        }, ANSWER_DELAY_MS);
    },

    /**
     * 時間切れ処理
     */
    handleTimeout() {
        if (this.isAnswering) {
            return;
        }

        this.isAnswering = true;
        // clear any pause marker
        this._pauseTimestamp = null;
        // clear any scheduled typing resume
        try { this._clearTypingTimeout(); } catch (e) { /* ignore */ }
        this.recordElapsedTime();

        this.sessionStats.wrong++;
        StorageManager.recordWrong(
            this.storageData,
            this.quizState.currentWord
        );

        const correctText =
            QuizManager.getCorrectAnswerText(this.quizState);

        UIManager.updateStats(this.sessionStats); // オブジェクトを渡すように修正
        UIManager.updateOverallStats(this.storageData); // 統計パネルの更新
        UIManager.disableInput();
        UIManager.showTimeout(correctText);

        QuizManager.advance(this.quizState);

        setTimeout(() => {
            this.startQuestion();
        }, TIMEOUT_DELAY_MS);
    },

    /**
     * クイズ終了
     */
    finishQuiz() {
        TimerManager.stop();
        UIManager.showFinish(this.sessionStats, this.storageData);
        UIManager.updateOverallStats(this.storageData); // 統計パネルの最終更新

        // 再度実施ボタンのイベントを設定（存在すれば）
        const retryBtn = document.getElementById('retryModeBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                // 再度同じモードで開始
                const modeToRestart = this.currentMode || 'all';
                // hide result area
                if (UIManager.elements && UIManager.elements.result) UIManager.elements.result.textContent = '';
                this.startNewQuiz(modeToRestart);
            });
        }
    },

    /**
     * エクスポート処理：単語ごとの正答率を JSON としてダウンロード
     */
    handleExport() {
        try {
            const wordsList = (typeof words !== 'undefined' && Array.isArray(words)) ? words : [];
            const exportArray = wordsList.map(w => {
                const key = w.english || w.word || '';
                const stat = (this.storageData && this.storageData.wordStats && this.storageData.wordStats[key]) || { correct:0, wrong:0 };
                const total = (stat.correct || 0) + (stat.wrong || 0);
                const accuracy = total ? (stat.correct / total * 100) : 0;
                return {
                    english: w.english || w.word || '',
                    japanese: w.japanese || (Array.isArray(w.answers) ? w.answers.join(', ') : ''),
                    correct: stat.correct || 0,
                    wrong: stat.wrong || 0,
                    accuracy: Number(accuracy.toFixed(1))
                };
            });

            const payload = {
                exportedAt: new Date().toISOString(),
                items: exportArray
            };

            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const filename = `vocabulary-stats-${new Date().toISOString().slice(0,10)}.json`;

            // Download via anchor
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        } catch (e) {
            console.error('Export failed:', e);
            alert('エクスポートに失敗しました。コンソールを確認してください。');
        }
    },

    /**
     * 新しいモードでクイズを開始（モード変更時に呼ぶ）
     * @param {string} mode
     */
    startNewQuiz(mode) {
        const modeName = mode || 'all';
        this.currentMode = modeName; // 現在のモードを保存
        // フィルタを適用
        const filtered = QuizManager.filterWords(words, this.storageData, modeName);
        if (!filtered || filtered.length === 0) {
            // 該当単語がない場合、全件にフォールバックせずユーザーへ通知して終了
            this.quizState = QuizManager.createState([]);
            this.sessionStats = { correct: 0, wrong: 0 };
            UIManager.updateStats(this.sessionStats);
            UIManager.updateProgress(0, 0);
            TimerManager.stop();
            UIManager.showNoWords('選択したモードに該当する単語がありません。別のモードを選択してください。');
            return;
        }

        const wordList = filtered.slice();
        this.quizState = QuizManager.createState(wordList);
        // セッション統計をリセット
        this.sessionStats = { correct: 0, wrong: 0 };
        UIManager.updateStats(this.sessionStats);
        UIManager.updateProgress(1, this.quizState.words.length);

        // 表示を初期化して最初の問題へ
        // stop any running timer and reset UI
        TimerManager.stop();
        this.startQuestion();
    }
};


// =============================================================================
// 起動
// =============================================================================

// DOMContentLoaded イベントでApp.init()を呼び出すことで、
// HTML要素が完全にロードされてからJavaScriptが実行されるようにする。
// これにより、getElementByIdがnullを返す可能性を減らす。
document.addEventListener('DOMContentLoaded', async () => {
    await App.init();
});
