import React, { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Printer, FileText, Upload, List, ChevronRight, CheckSquare, Square, Trash2, Edit, X } from 'lucide-react';

// Tailwind CSSを前提としています

// 💡 支店コードと支店名のマッピング
const BRANCH_MAP = {
    '001': '札幌支店', '101': '青森支店', '102': '八戸営業所', '111': '盛岡支店', '121': '秋田支店', 
    '131': '仙台支店', '141': '山形支店', '142': '酒田営業所', '151': '郡山支店', '153': '福島支店', 
    '201': '新潟支店', '202': '長岡支店', '203': '上越営業所', '211': '長野支店', '212': '松本支店', 
    '213': '上田支店', '214': '軽井沢営業所', '221': '富山支店', '231': '金沢支店', '241': '福井支店', 
    '301': '群馬支店', '311': '水戸支店', '331': '首都圏本部', '401': '名古屋支店', '411': '静岡支店', 
    '501': '関西本部', '601': '広島支店', '611': '岡山支店', '701': '四国支店', '801': '福岡支店', 
    '802': '鹿児島支店',
};

// 💡 初期データ
const INITIAL_EMPTY_DATA = {
    isPrinted: false,
    isPDFGenerated: false,
    branchName: '', 
    propertyNo: '',
    propertyName: '',
    propertyLocation: '',
    constructionDate: '',
    builderName: '', // CSV連携後の初期値
};

// --- ユーティリティ関数 ---

const formatConstructionDate = (dateString) => {
    if (!dateString) return '';
    try {
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const year = parts[0];
            const month = parts[1].padStart(2, '0');
            const day = parts[2].padStart(2, '0');
            return `${year}年${month}月${day}日`;
        }
    } catch {}
    return dateString;
};

const getFormattedToday = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}年${month}月${day}日`;
};

const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, ''));
    
    // 🏆 ビルダー様名の列インデックスをF列 (インデックス5) に固定
    const BUILDER_NAME_COLUMN_INDEX = 5; 

    const colMap = {
        '支店コード': headers.indexOf('支店コード'), // A列 (インデックス0)
        '売上日': headers.indexOf('売上日'), // B列 (インデックス1)
        '受注№': headers.indexOf('受注№'), // C列 (インデックス2)
        '物件名': headers.indexOf('物件名'), // D列 (インデックス3)
        'お客様住所': headers.indexOf('お客様住所'), // E列 (インデックス4)
    };
    
    // 物件名 (propertyName) は D列 (インデックス3) を使用
    const propertyNameIndex = colMap['物件名']; 
    
    if (colMap['支店コード'] === -1 || propertyNameIndex === -1) {
        console.error("CSVヘッダーに '支店コード' または '物件名' が見つかりません。");
        return [];
    }

    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let inQuote = false;
        let start = 0;
        
        // 1. CSV解析ロジック
        for (let j = 0; j < lines[i].length; j++) {
            if (lines[i][j] === '"') inQuote = !inQuote;
            else if (lines[i][j] === ',' && !inQuote) {
                values.push(lines[i].substring(start, j).replace(/"/g, '').trim());
                start = j + 1;
            }
        }
        values.push(lines[i].substring(start).replace(/"/g, '').trim());
        
        // 必要な列インデックスの最大値チェック (F列(5)まで必要であることを明示)
        const maxIndex = Math.max(
            colMap['支店コード'], 
            colMap['売上日'], 
            colMap['受注№'], 
            propertyNameIndex, 
            colMap['お客様住所'],
            BUILDER_NAME_COLUMN_INDEX 
        );

        if (values.length > maxIndex) {
            
            const branchCode = values[colMap['支店コード']].trim();
            const propertyNo = values[colMap['受注№']].trim();
            const rawPropertyName = values[propertyNameIndex].replace(/"/g, '').trim();
            const rawBuilderName = values[BUILDER_NAME_COLUMN_INDEX].replace(/"/g, '').trim();
            
            // 🚨 修正1: 主要なデータ（支店コード、物件No、物件名）が空の場合はスキップ
            if (!branchCode || !propertyNo || !rawPropertyName) {
                console.warn(`CSVスキップ: 行 ${i + 1} の主要データが不完全です。`);
                continue; // この行は無視して次の行へ
            }

            // 🚨 修正2: ビルダー様名が空の場合は「様」を追記しない
            const finalBuilderName = rawBuilderName ? `${rawBuilderName}様` : '';

            data.push({
                isPrinted: false,
                isPDFGenerated: false,
                branchName: BRANCH_MAP[branchCode] || `支店コード:${branchCode} (未登録)`,
                propertyNo: propertyNo,
                
                // 物件名の「様」自動追記ロジックは残しておく (D列の値を使用)
                propertyName: rawPropertyName + (
                    rawPropertyName.endsWith('様') ||
                    rawPropertyName.endsWith('集合住宅') ||
                    rawPropertyName.endsWith('コーポ') ||
                    rawPropertyName.endsWith('号') 
                    ? '' : '様'
                ),
                propertyLocation: values[colMap['お客様住所']].replace(/"/g, '').trim(),
                constructionDate: formatConstructionDate(values[colMap['売上日']].trim()),
                
                // 🏆 修正適用
                builderName: finalBuilderName, 
            });
        }
    }
    return data;
};

// --- 裏面リストの初期値定義 ---
const initialBackContent = `1） ヤマトシロアリまたはイエシロアリ以外の害虫（キクイムシ、シンクイムシ等）動物、植物に起因する被害が発生した場合。

2） ICOSA strong systemを行い、床下・玄関内土間、勝手土間以外からのシロアリ侵入・喰害による被害の場合。
例：基礎外側から蟻道等をつくり換気口や水切部から侵入する場合。土中からの侵入でなく飛来して木部に被害をもたらした場合。屋外デッキを通じてシロアリ被害が生じた場合。

3） 対象建物又は、ICOSA strong system が施工された部位が水害による被害を受けた場合。

4） 地震・津波・台風・火災その他の災害に起因する場合。
例：地震によるコンクリートのクラック

5） 雨漏り、漏水、内部結露及び建物の破損など、対象建物の保守管理状況が悪く被害発生の原因となった場合。

6） 対象建物の構造体や構成部材以外の部分（書籍・家具類等の動産や玄関固定の木桟、額縁、玄関そで壁等）に起因する場合。

7） 外周基礎と隣接する設置物が原因をなって、シロアリ被害が起きた場合。
例：デッキ材、物置、小屋、木材片、杭、柵等。

8） 換気部分が障害物により阻害され、換気性能に支障をきたしていた場合。

9） 理由の如何を問わず、保証書申請時の内容と異なる記載、保険規定に反する事実があったことが判明した場合。

10） 対象建築物に増築又は改築がなされた場合。ただし、増築又は改築部分に、弊社が認める方法によりICOSA strong system が施工された場合にはこの限りではない。

11） 本保証書「6.ご連絡のお願い」でお願いしているご連絡がなされなかった場合。

12） その他、第三者の責めに帰すべき事由によりシロアリ被害が生た場合。

13） 建物を点検なしに無人の状態で3カ月以上放置した（建売住宅・別荘等）ために被害が発生した場合。

14） 床下に工事の残材の木片などシロアリの餌となるものを放置した事で被害が発生した場合。`;


// --- FieldRow コンポーネント (A4フィットのためスタイル調整) ---
const FieldRow = memo(({ label, value, fieldKey, onChange, placeholder = '', className = '', isModal = false }) => {
    
    // スタイル調整
    const inputClassName = isModal 
        ? "flex-1 border border-gray-300 p-1 rounded focus:outline-none focus:border-blue-500 text-sm"
        // 🏆 A4フィット調整: 印刷時のテキストサイズとマージンを最小限に
        : "flex-1 border-b border-gray-300 pb-[1px] pl-2 focus:outline-none focus:border-blue-500 print:border-b-0 print:border-gray-300 print:text-xs print:min-h-[1.2rem]"; 
    
    const labelClassName = isModal
        ? "w-24 font-bold text-gray-600 text-sm flex-shrink-0"
        // 🏆 A4フィット調整: 印刷時のラベルサイズを最小限に
        : "min-w-[80px] font-bold text-gray-600 print:min-w-[65px] print:text-[11px]"; 

    // 🔑 IME/Focus Fix: Local state for input value and composition status
    const [inputValue, setInputValue] = useState(value);
    const [isComposing, setIsComposing] = useState(false);

    // 1. 親コンポーネントから渡された 'value' が変更されたら、ローカル状態を同期する
    useEffect(() => {
        // IME入力中でない場合のみ同期する (親の再レンダリングが入力を中断しないように)
        if (!isComposing) {
            setInputValue(value);
        }
    }, [value, isComposing]);

    // 2. 標準の入力処理
    const handleInputChange = (e) => {
        setInputValue(e.target.value); // ローカルの状態は常に即座に更新し、スムーズな入力を実現
        
        // 🚀 修正: isModalかつonChangeが存在する場合のみ、親の状態を更新する
        if (isModal && onChange && fieldKey) {
            // IME入力中でない場合のみ、親の状態を更新する
            if (!isComposing) {
                 onChange(fieldKey, e.target.value);
            }
        }
    };

    // 3. IMEの開始
    const handleCompositionStart = () => setIsComposing(true);

    // 4. IMEの終了
    const handleCompositionEnd = (e) => {
        setIsComposing(false);
        
        // 🚀 修正: isModalかつonChangeが存在する場合のみ
        if (isModal && onChange && fieldKey) {
            // 変換が終了した時点で、親の状態を最終値で更新する
            onChange(fieldKey, e.target.value);
        }
    };

    return (
        // 🏆 A4フィット調整: マージンを小さく
        <div className={`flex items-baseline mb-1.5 text-sm leading-snug print:mb-0 print:leading-tight ${className}`}>
            <span className={labelClassName}>{label}</span>

            {isModal ? (
                <input
                    type="text"
                    value={inputValue} // ローカルの状態を使う
                    onChange={handleInputChange} 
                    onCompositionStart={handleCompositionStart} // IME対応
                    onCompositionEnd={handleCompositionEnd} // IME対応
                    placeholder={placeholder}
                    className={inputClassName}
                />
            ) : (
                <span className={inputClassName}>{value}</span>
            )}
        </div>
    );
});


// --- メインコンポーネント ---

export default function CertificateApp() {
    // 🏆 メインパスワード (アプリケーション全体)
    const MAIN_APP_KEY = 'Picoi64710811'; 
    // 裏面編集エリアのパスワード (既存)
    const BACK_PAGE_UNLOCK_KEY = '64712174'; 

    const getStoredValue = (key, defaultValue) => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    if (key === 'csvDataList') return JSON.parse(stored);
                    if (key !== 'backPageListText') return stored; 
                } catch {
                    return stored;
                }
            }
        }
        return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
    };

    // 🏆 メインアプリロック状態
    const [isAppLocked, setIsAppLocked] = useState(true); 
    const [mainKeyInput, setMainKeyInput] = useState('');
    const [mainKeyError, setMainKeyError] = useState('');

    const [qrImage, setQrImage] = useState(() => getStoredValue('qrImage', null));
    const [sealImage, setSealImage] = useState(() => getStoredValue('sealImage', null));
    // 🏆 新規追加: ロゴ画像のstate
    const [logoImage, setLogoImage] = useState(() => getStoredValue('logoImage', null));
    
    const [csvDataList, setCsvDataList] = useState(() => getStoredValue('csvDataList', []));
    
    const [currentData, setCurrentData] = useState(() => {
        const initialList = getStoredValue('csvDataList', []);
        if (initialList.length > 0) {
            const lastPropertyNo = getStoredValue('lastSelectedPropertyNo', null);
            // 💡 currentDataの初期化時にbuilderNameが空にならないようにする
            const saved = initialList.find(d => d.propertyNo === lastPropertyNo);
            return saved || initialList[0];
        }
        return INITIAL_EMPTY_DATA;
    });

    const qrFileInputRef = useRef(null);
    const sealFileInputRef = useRef(null);
    // 🏆 新規追加: ロゴファイルのref
    const logoFileInputRef = useRef(null);
    const csvFileInputRef = useRef(null);

    // 🚀 修正: 発行日をローカルストレージから復元せず、常に今日の新しい日付で初期化する
    const [issuanceDate, setIssuanceDate] = useState(getFormattedToday);
    
    const [constructionStore, setConstructionStore] = useState(() => getStoredValue('constructionStore', ''));
    
    // 💡 修正: ローカルストレージを無視し、常に initialBackContent で初期化
    const [backPageListText, setBackPageListText] = useState(initialBackContent);

    // 既存の裏面編集ロック状態
    const [isLocked, setIsLocked] = useState(true);
    const [unlockKeyInput, setUnlockKeyInput] = useState('');
    const [unlockError, setUnlockError] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tempData, setTempData] = useState({});

    // 💡 新規: バッチ印刷用の状態
    const [isBatchPrinting, setIsBatchPrinting] = useState(false);
    const [batchPrintIndex, setBatchPrintIndex] = useState(-1);

    // データの永続化と currentData の更新
    useEffect(() => {
        localStorage.setItem('qrImage', qrImage);
        localStorage.setItem('sealImage', sealImage);
        // 🏆 新規追加: ロゴ画像の永続化
        localStorage.setItem('logoImage', logoImage); 
        // 🚀 修正: issuanceDateの永続化を削除 - 常に当日が設定されるようにする
        // localStorage.setItem('issuanceDate', issuanceDate); 
        localStorage.setItem('constructionStore', constructionStore);
        // 💡 修正: builderNameの個別保存を削除 (currentDataの一部として保存される)
        localStorage.setItem('backPageListText', backPageListText);
    }, [qrImage, sealImage, logoImage, constructionStore, backPageListText]); // issuanceDateを依存配列から削除

    useEffect(() => {
        localStorage.setItem('csvDataList', JSON.stringify(csvDataList));
        if (csvDataList.length > 0) {
            const lastPropertyNo = getStoredValue('lastSelectedPropertyNo', null);
            const saved = csvDataList.find(d => d.propertyNo === lastPropertyNo);
            // NOTE: バッチ印刷中のsetCurrentDataはuseEffectが担当するため、ここではリスト更新時のみ処理
            if (!isBatchPrinting) {
                // builderNameを含んだデータで初期化
                setCurrentData(saved || csvDataList[0]);
            }
        } else {
            setCurrentData(INITIAL_EMPTY_DATA);
            localStorage.removeItem('lastSelectedPropertyNo');
        }
    }, [csvDataList, isBatchPrinting]);

    useEffect(() => {
        if (currentData && currentData.propertyNo) {
            localStorage.setItem('lastSelectedPropertyNo', currentData.propertyNo);
        }
    }, [currentData]);

    // 施工店名の自動反映ロジック
    useEffect(() => {
        if (currentData && currentData.branchName) {
            if (!localStorage.getItem('constructionStore_manual_override')) {
                setConstructionStore(currentData.branchName);
            }
        }
    }, [currentData]);
    
    // アプリケーション起動時の初期タイトル設定
    useEffect(() => {
        if (document.title === 'React App' || document.title === '') {
            document.title = '証明書発行アプリ';
        }
    }, []);

    // 状態更新関数をuseCallbackでラップし、安定性を向上 (useEffectで使用するため)
    const updatePropertyStatus = useCallback((propertyNo, key, value) => {
        if (!propertyNo) return;
        setCsvDataList(list => list.map(d => d.propertyNo === propertyNo ? { ...d, [key]: value } : d));
        // バッチ印刷中ではない場合のみ、currentDataも更新
        // 🚀 修正: currentData.propertyNo === propertyNo のチェックを追加
        if (currentData.propertyNo === propertyNo && !isBatchPrinting) {
            setCurrentData(d => ({ ...d, [key]: value }));
        }
    }, [currentData, isBatchPrinting]);
    
    // 💡 既存: バッチ印刷制御のためのuseEffect
    useEffect(() => {
        
        // 印刷が完了したときの処理
        if (isBatchPrinting && batchPrintIndex >= csvDataList.length) {
            setIsBatchPrinting(false);
            setBatchPrintIndex(-1);
            
            // 印刷前の状態（最後に選択されていた物件）を復元
            const lastSelectedPropertyNo = getStoredValue('lastSelectedPropertyNo', null);
            const lastSelected = csvDataList.find(d => d.propertyNo === lastSelectedPropertyNo);
            
            if (lastSelected) {
                setCurrentData(lastSelected);
            } else if (csvDataList.length > 0) {
                setCurrentData(csvDataList[0]);
            } else {
                setCurrentData(INITIAL_EMPTY_DATA);
            }
            
            // 施工店名を復元 (手動オーバーライドも考慮)
            setConstructionStore(getStoredValue('constructionStore', ''));
            
            alert("一括印刷が完了しました。");
            return;
        }

        // 印刷処理が必要な場合 (indexが有効な範囲内)
        if (isBatchPrinting && batchPrintIndex >= 0) {
            const dataToPrint = csvDataList[batchPrintIndex];
            if (!dataToPrint) {
                setBatchPrintIndex(prev => prev + 1); // データがない場合はスキップ
                return;
            }
            
            // 1. 印刷対象のデータを設定 (DOM更新をトリガー)
            setCurrentData(dataToPrint);
            setConstructionStore(dataToPrint.branchName);
            localStorage.removeItem('constructionStore_manual_override'); // 一括印刷時は強制的に上書き

            // 2. DOMの更新完了を待ってからprint()を呼ぶためにsetTimeoutで遅延させる
            const printTimer = setTimeout(() => {
                
                // 文書タイトルを設定
                const originalTitle = document.title;
                document.title = `${dataToPrint.propertyName}_保証書`; 

                // 印刷を実行 (ユーザーの操作でJS実行が一時停止)
                window.print();
                
                // タイトルを元に戻す
                setTimeout(() => { document.title = originalTitle; }, 100);

                // 3. 印刷後処理
                // updatePropertyStatus内で currentData.propertyNo が変わっている可能性があるため、
                // dataToPrint.propertyNo を使用
                updatePropertyStatus(dataToPrint.propertyNo, 'isPrinted', true); 
                setBatchPrintIndex(prev => prev + 1); // indexをインクリメントし、次のサイクルをトリガー
                
            }, 50); // 50msの短い遅延

            return () => clearTimeout(printTimer);
        }
    }, [batchPrintIndex, isBatchPrinting, csvDataList, updatePropertyStatus]); // ⚠️ 修正箇所: updatePropertyStatusを追加

    // 🏆 新規: メインアプリのロック解除ハンドラ
    const handleMainUnlock = () => {
        if (mainKeyInput === MAIN_APP_KEY) {
            setIsAppLocked(false);
            setMainKeyError('');
            setMainKeyInput('');
        } else {
            setMainKeyError('メインパスワードが異なります。');
        }
    };

    // --- ロック/CSV/データクリア/選択ハンドラ ---
    const handleUnlock = () => {
        if (unlockKeyInput === BACK_PAGE_UNLOCK_KEY) {
            setIsLocked(false);
            setUnlockError('');
            setUnlockKeyInput('');
        } else {
            setUnlockError('ロック解除キーが異なります。');
        }
    };

    const setConstructionStoreAndOverride = (value) => {
        setConstructionStore(value);
        if (currentData && value !== currentData.branchName && value !== '') {
            localStorage.setItem('constructionStore_manual_override', 'true');
        } else if (value === currentData.branchName || value === '') {
            localStorage.removeItem('constructionStore_manual_override');
        }
    };

    const handleCSVUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const parsed = parseCSV(text);
            setCsvDataList(parsed);

            if (parsed.length > 0) {
                setCurrentData(parsed[0]);
                setConstructionStore(parsed[0].branchName);
                localStorage.removeItem('constructionStore_manual_override');
                alert(`${parsed.length}件の有効な物件データを読み込みました。`);
            } else {
                setCurrentData(INITIAL_EMPTY_DATA);
                setConstructionStore('');
                alert("有効な物件データが見つかりませんでした。");
            }
        };

        try {
            reader.readAsText(file, 'Shift_JIS');
        } catch {
            reader.readAsText(file, 'UTF-8');
        }
        event.target.value = null;
    };

    const handleClearData = () => {
        if (csvDataList.length === 0) return;

        if (window.confirm(`${csvDataList.length}件の物件データを削除しますか？`)) {
            setCsvDataList([]);
            setCurrentData(INITIAL_EMPTY_DATA);
            setConstructionStore('');
            // 💡 修正: builderNameのローカルストレージ削除を削除
            localStorage.removeItem('csvDataList');
            localStorage.removeItem('lastSelectedPropertyNo');
            localStorage.removeItem('constructionStore_manual_override');
            alert("削除しました。");
        }
    };

    const selectProperty = (data) => setCurrentData(data);

    const updatePropertyInList = (updated) => {
        if (!updated.propertyNo) return;
        setCsvDataList(list => list.map(d => d.propertyNo === updated.propertyNo ? updated : d));
        if (currentData.propertyNo === updated.propertyNo) {
            setCurrentData(updated);
        }
    };
    
    const handleTempChange = useCallback((key, value) => {
        setTempData(prev => ({ ...prev, [key]: value }));
    }, []);

    // --- モーダル制御ロジック ---
    const openModal = () => {
        setTempData({
            propertyNo: currentData.propertyNo || '',
            propertyName: currentData.propertyName || '',
            propertyLocation: currentData.propertyLocation || '',
            constructionDate: currentData.constructionDate || '',
            issuanceDate,
            constructionStore,
            builderName: currentData.builderName || '', // 💡 currentDataから取得
        });
        setIsModalOpen(true);
    };

    const closeModal = () => setIsModalOpen(false);

    const handleModalSave = () => {
        const newData = {
            ...currentData,
            propertyNo: tempData.propertyNo,
            propertyName: tempData.propertyName,
            propertyLocation: tempData.propertyLocation,
            constructionDate: tempData.constructionDate,
            builderName: tempData.builderName, // 💡 builderNameを更新
        };
        
        // CSVリストに反映
        if (currentData.propertyNo) {
            updatePropertyInList(newData);
        } else if (tempData.propertyNo && csvDataList.length === 0) {
            setCsvDataList([newData]);
            setCurrentData(newData);
        } else {
            setCurrentData(newData);
        }

        // 🚀 発行日 (issuanceDate) は常に当日であるべきだが、モーダルで手動入力された場合はそれを一時的に保持
        setIssuanceDate(tempData.issuanceDate);
        setConstructionStoreAndOverride(tempData.constructionStore);
        closeModal();
    };

    // --- 印刷ハンドラ (中略: ロジックは変更なし) ---

    // ファイル名を「保証書」に変更
    const handlePrint = () => {
        if (!currentData.propertyNo) {
            alert("物件番号がありません。手動編集してください。");
            return;
        }

        const originalTitle = document.title;
        document.title = `${currentData.propertyName}_保証書`; 
        
        window.print();
        updatePropertyStatus(currentData.propertyNo, 'isPrinted', true);

        setTimeout(() => {
            document.title = originalTitle;
        }, 100);
    };

    // ファイル名を「保証書(PDF)」に変更
    const handlePDF = () => {
        if (!currentData.propertyNo) {
            alert("物件番号がありません。手動編集してください。");
            return;
        }

        const originalTitle = document.title;
        document.title = `${currentData.propertyName}_保証書(PDF)`; 
        
        window.print();
        updatePropertyStatus(currentData.propertyNo, 'isPDFGenerated', true);

        setTimeout(() => {
            document.title = originalTitle;
        }, 100);
    };
    
    // 💡 既存: バッチ印刷のロジックをスターターに変更
    const handleBatchPrint = () => {
        if (csvDataList.length === 0) {
            alert("印刷対象データがありません。");
            return;
        }

        if (isBatchPrinting) {
             alert("現在、一括印刷処理中です。");
            return;
        }

        if (!window.confirm(`${csvDataList.length}件を連続印刷しますか？`)) return;
        
        // 印刷プロセスを開始
        setIsBatchPrinting(true);
        setBatchPrintIndex(0);
    };

    // --- 画像アップロード/ImageUploadBox コンポーネント ---
    const handleImageUpload = (event, setImageState) => {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => setImageState(e.target.result);
        reader.readAsDataURL(file);
    };

    const ImageUploadBox = ({ title, image, setImageState, fileInputRef, placeholderText, boxClassName, imgClassName }) => (
        <div className="flex flex-col items-center print:block print:w-auto">
            {/* 🏆 修正1: title (ロゴ画像/会社印) の <strong> タグを削除 
               QRコードエリアで使用する場合のみ、このtitleが残るように調整します。
               【今回の修正】: print-hidden を削除し、QRコードタイトルを印刷時に表示する
            */}
            {title && <strong className="text-blue-800 text-sm print:text-xs">{title}</strong>}
            
            <div
                // 🏆 修正2: 画像がない場合、ロゴ/会社印（title === ''）のときのみ print-hidden
                className={`w-32 h-32 border-2 border-dashed border-blue-400 bg-white shadow-inner cursor-pointer flex items-center justify-center m-2 overflow-hidden print:border-none print:shadow-none print:m-0 print:p-0 ${boxClassName} ${!image && title === '' ? 'print-hidden' : ''}`}
                onClick={() => fileInputRef.current.click()}
                // 💡 印刷時の枠線・背景設定を統一
                style={image ? { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', backgroundColor: 'white' } : {}}
            >
                {image ? (
                    <img src={image} alt={title} className={`object-contain ${imgClassName}`} />
                ) : (
                    /* 🏆 修正3: 画像がない場合、アイコンと「画像を挿入」プロンプトを表示。
                       QRコードエリアのようにplaceholderTextがある場合は、それも表示する。
                    */
                    <div className="text-center text-xs text-gray-400 p-2 print:text-[10px] print:text-gray-700 print-hidden"> 
                        <Upload className="w-5 h-5 mx-auto mb-1 print:w-4 print:h-4" />
                        <p>画像を挿入</p> 
                        {placeholderText && <p className='mt-1 text-[10px] text-gray-400'>{placeholderText}</p>}
                    </div>
                )}
            </div>
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e, setImageState)}
            />
        </div>
    );

    // 🏆 免責事項リストのレンダリング関数
    const renderBackPageList = (text) => {
        const items = text.split('\n').filter(line => line.trim() !== '');
        
        const formattedItems = [];
        let currentItem = null;
        
        items.forEach(line => {
            // 1) または 1）で始まる行を検出
            const match = line.match(/^(\d+)\s*[）)]\s*(.*)/); // ⚠️ 修正箇所: \を削除 (ビルドエラー対応)
            // 例：で始まる行を検出
            const isExample = line.trim().startsWith('例：'); 
            
            if (match) {
                // 新しい項目開始
                if (currentItem) {
                    formattedItems.push(currentItem);
                }
                const number = match[1];
                const content = match[2].trim();
                currentItem = {
                    number: number,
                    content: content,
                    examples: []
                };
            } else if (isExample && currentItem) {
                // 例を現在の項目に追加
                currentItem.examples.push(line.trim());
            } else if (line.trim() !== '' && currentItem) {
                // 継続行として現在の項目に追加
                // 行末にスペースを追加して結合
                currentItem.content += ' ' + line.trim();
            }
        });
        
        if (currentItem) {
            formattedItems.push(currentItem);
        }

        return (
            <ol className="list-none pl-0 space-y-4 text-sm print:text-xs print:space-y-2">
                {formattedItems.map((item, index) => (
                    <li key={index} className='font-medium relative pl-6'>
                        <span className="absolute left-0 top-0 font-bold text-red-600 print:text-black">{item.number}）</span>
                        <p className='leading-snug mb-1 print:mb-0'>{item.content}</p>
                        {item.examples.map((ex, exIndex) => (
                            <p key={exIndex} className='text-xs text-gray-600 pl-2 print:text-[10px] print:text-gray-700'>{ex}</p>
                        ))}
                    </li>
                ))}
            </ol>
        );
    };

    // 💡 既存: 手動編集用モーダルコンポーネント
    const ManualEditModal = () => {
        
        if (!isModalOpen) return null;

        return (
            <div className="fixed inset-0 z-[100] bg-black bg-opacity-50 flex justify-center items-center print-hidden">
                <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-lg mx-4">
                    <div className="flex justify-between items-center border-b pb-3 mb-4">
                        <h2 className="text-xl font-bold text-red-600 flex items-center">
                            <Edit className="w-5 h-5 mr-2" />
                            証明書データ 手動編集
                        </h2>
                        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <p className="text-sm text-gray-600 mb-4 border-b pb-2">
                        CSV未読み込み時の**手入力**、または表示中の**物件情報の上書き修正**にご利用ください。
                    </p>

                    <div className="space-y-3 text-sm">
                        <FieldRow label="物件No" value={tempData.propertyNo || ''} fieldKey="propertyNo" onChange={handleTempChange} isModal={true} placeholder="物件番号を入力"/>
                        <FieldRow label="物件名" value={tempData.propertyName || ''} fieldKey="propertyName" onChange={handleTempChange} isModal={true} placeholder="物件名を入力"/>
                        <FieldRow label="所在地" value={tempData.propertyLocation || ''} fieldKey="propertyLocation" onChange={handleTempChange} isModal={true} placeholder="物件の所在地を入力"/>
                        {/* 💡 ビルダー様名 */}
                        <FieldRow label="ビルダー様名" value={tempData.builderName || ''} fieldKey="builderName" onChange={handleTempChange} isModal={true} placeholder="ビルダー名を入力"/>
                        <FieldRow label="施工日" value={tempData.constructionDate || ''} fieldKey="constructionDate" onChange={handleTempChange} isModal={true} placeholder="例: 2024年01月23日"/>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
                         <FieldRow 
                             label="発行日" 
                             // 🚀 修正: モーダルを開いた時点の current issuanceDate で初期化する
                             value={tempData.issuanceDate || issuanceDate} 
                             fieldKey="issuanceDate" 
                             onChange={handleTempChange} 
                             isModal={true} 
                             placeholder="例: 2024年01月23日"
                         />
                        <FieldRow label="施工店名" value={tempData.constructionStore || ''} fieldKey="constructionStore" onChange={handleTempChange} isModal={true} placeholder="施工店名を入力"/>
                    </div>

                    <div className="flex justify-end mt-6 space-x-3">
                        <button onClick={closeModal} className="px-6 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 transition">キャンセル</button>
                        <button onClick={handleModalSave} className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">
                            OK (証明書に反映)
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // --- メインレンダリング ---
    return (
        <div className="bg-gray-100 p-4 min-h-screen print:bg-white print:p-0 print:m-0 print:min-h-0 flex">
            
            {/* 🏆 メインロック画面 */}
            {isAppLocked && (
                <div className="fixed inset-0 z-[200] bg-gray-900 bg-opacity-95 flex justify-center items-center">
                    <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-md text-center">
                        <h2 className="text-3xl font-bold text-red-600 mb-6">🔐 システムロック</h2>
                        <p className="text-gray-700 mb-6">本アプリケーションを使用するには、メインパスワードを入力してください。</p>
                        
                        {mainKeyError && <p className="text-sm text-red-500 mb-4 font-semibold">{mainKeyError}</p>}
                        
                        <input
                            type="password"
                            value={mainKeyInput}
                            onChange={(e) => {
                                setMainKeyInput(e.target.value);
                                setMainKeyError('');
                            }}
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') handleMainUnlock();
                            }}
                            placeholder="メインパスワードを入力"
                            className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-lg text-center focus:border-blue-500 focus:ring focus:ring-blue-200"
                        />
                        <button
                            onClick={handleMainUnlock}
                            className="w-full px-4 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition duration-200 text-lg shadow-md"
                        >
                            ロック解除
                        </button>
                    </div>
                </div>
            )}

            {/* 🏆 ロック解除後のメインアプリケーションUI */}
            {!isAppLocked && (
                <>
                    <ManualEditModal />

                    {/* 印刷用CSSスタイル */}
                    <style>
                        {`
                        @media print {
                            @page {
                                size: A4;
                                margin: 0;
                            }
                            
                            .print-hidden {
                                display: none !important; /* 修正: !importantを追加し、確実に非表示にする */
                            }

                            .certificate-wrapper {
                                max-width: none !important; 
                                width: 210mm !important; 
                                padding: 0 !important; 
                                box-shadow: none !important;
                                margin: 0 auto !important; 
                            }

                            .print-front-page,
                            .print-back-page {
                                display: block;
                                width: 190mm; 
                                // 🏆 A4フィット調整: 高さの余裕を持たせるため、最小限の高さ設定を削除
                                // height: 275mm; 
                                margin: 11mm auto !important; 
                                padding: 20px; /* 🏆 A4フィット調整: ページ内余白を少し減らす */
                                box-shadow: none !important;
                                box-sizing: border-box; 
                            }

                            .print-back-page {
                                page-break-before: always; 
                                border: 3px double #B91C1C !important; /* 🏆 A4フィット調整: 罫線を細く */
                            }

                            .print-front-page {
                                border: 3px double #1D4ED8 !important; /* 🏆 A4フィット調整: 罫線を細く */
                            }
                        }
                        `}
                    </style>
                    
                    {/* サイドバー: CSV読み込みと物件リスト */}
                    <div className="w-80 bg-white p-4 shadow-xl border-r border-gray-200 flex flex-col print-hidden flex-shrink-0">
                        <h2 className="text-xl font-bold text-blue-800 mb-4 flex items-center">
                            <List className="w-6 h-6 mr-2"/> 物件データ管理
                        </h2>

                        <button
                            onClick={openModal}
                            className="flex items-center justify-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 mb-4"
                        >
                            <Edit className="w-5 h-5" />
                            <span>物件データを手動編集・入力</span>
                        </button>
                        
                        <button
                            onClick={() => csvFileInputRef.current.click()}
                            className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 mb-2"
                        >
                            <Upload className="w-5 h-5" />
                            <span>CSVを読み込む</span>
                        </button>
                        <input
                            type="file"
                            ref={csvFileInputRef}
                            accept=".csv"
                            style={{ display: 'none' }}
                            onChange={handleCSVUpload}
                        />
                        
                        {csvDataList.length > 0 && (
                            <button
                                onClick={handleBatchPrint}
                                className={`flex items-center justify-center space-x-2 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 mb-2 ${
                                    isBatchPrinting ? 'bg-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'
                                }`}
                                disabled={isBatchPrinting}
                            >
                                <Printer className="w-5 h-5" />
                                <span>{isBatchPrinting ? `連続印刷中...(${csvDataList.length - batchPrintIndex}件)` : '全件印刷（PDF作成）'}</span>
                            </button>
                        )}

                        <button
                            onClick={handleClearData}
                            className="flex items-center justify-center space-x-2 bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 mb-4"
                        >
                            <Trash2 className="w-5 h-5" />
                            <span>全件削除/全リセット</span>
                        </button>
                        
                        
                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-md p-2">
                            <p className="text-sm font-bold mb-2">
                                {csvDataList.length > 0 ? (
                                    <span className='text-blue-600'>CSV読み込み物件リスト ({csvDataList.length}件)</span>
                                ) : (
                                    <span className='text-gray-500'>CSVリストがありません</span>
                                )}
                            </p>
                            {csvDataList.length === 0 ? (
                                <p className="text-sm text-gray-400">CSVを読み込むか、上のボタンから手動入力してください。</p>
                            ) : (
                                <ul className="space-y-1">
                                    {csvDataList.map((data, index) => (
                                        <li 
                                            key={index}
                                            className={`p-2 rounded-md transition duration-150 text-sm border ${
                                                currentData.propertyNo === data.propertyNo 
                                                    ? 'bg-blue-100 border-l-4 border-blue-500 font-bold text-blue-800 border-blue-200'
                                                    : 'hover:bg-gray-50 border-gray-100'
                                            }`}
                                        >
                                            <div className='flex justify-between items-start mb-2'>
                                                <div className='cursor-pointer flex-1 mr-2' onClick={() => selectProperty(data)}>
                                                    <span className="font-semibold text-xs">{data.propertyNo}</span>
                                                    <div className="text-sm truncate leading-snug">{data.propertyName}</div>
                                                    <div className="text-xs text-gray-400">
                                                        {data.constructionDate.replace(/年|月|日/g, '/').slice(0, -1)}
                                                        <span className='ml-2 text-blue-500'>({data.branchName})</span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => selectProperty(data)}
                                                    className="text-gray-500 hover:text-blue-500 transition duration-150 p-1 rounded-full border border-gray-300 bg-white"
                                                    title="選択して証明書に反映"
                                                >
                                                    <ChevronRight className='w-4 h-4' />
                                                </button>
                                            </div>
                                            
                                            <div className='flex justify-between items-center text-xs mt-2 pt-2 border-t border-gray-200'>
                                                <div className='flex space-x-2'>
                                                    <button 
                                                        onClick={() => { selectProperty(data); handlePDF(); }}
                                                        className='flex items-center space-x-1 px-2 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded-md transition duration-150'
                                                        title="PDFとして保存"
                                                    >
                                                        <FileText className='w-3 h-3'/>
                                                        <span>PDF</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => { selectProperty(data); handlePrint(); }}
                                                        className='flex items-center space-x-1 px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition duration-150'
                                                        title="印刷"
                                                    >
                                                        <Printer className='w-3 h-3'/>
                                                        <span>印刷</span>
                                                    </button>
                                                </div>
                                                <div className={`flex space-x-3`}>
                                                    <div className={`flex items-center ${data.isPDFGenerated ? 'text-green-600' : 'text-gray-400'}`}>
                                                        {data.isPDFGenerated ? <CheckSquare className='w-4 h-4 mr-1'/> : <Square className='w-4 h-4 mr-1'/>}
                                                        PDF
                                                    </div>
                                                    <div className={`flex items-center ${data.isPrinted ? 'text-green-600' : 'text-gray-400'}`}>
                                                        {data.isPrinted ? <CheckSquare className='w-4 h-4 mr-1'/> : <Square className='w-4 h-4 mr-1'/>}
                                                        印刷
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>

                    {/* 証明書コンテナ */}
                    <div className="flex-1 max-w-[190mm] mx-auto p-4 md:p-8 bg-white shadow-xl certificate-wrapper">
                        
                        {/* 制御パネル */}
                        <div className="fixed top-4 right-4 z-50 flex gap-3 print-hidden">
                            <button
                                onClick={handlePDF}
                                className="flex items-center space-x-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200"
                                title="PDFとして保存 (Save as PDF)"
                            >
                                <FileText className="w-5 h-5" />
                                <span>PDF作成</span>
                            </button>
                            <button
                                onClick={handlePrint}
                                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200"
                                title="印刷 (Print)"
                            >
                                <Printer className="w-5 h-5" />
                                <span>印刷</span>
                            </button>
                        </div>
                        
                        {/* 印刷対象の証明書本体（表面 - 1ページ目） */}
                        <div className='print-front-page border-4 border-double border-blue-800 relative'> 

                            <div className='absolute top-1 right-1 print:top-[2mm] print:right-[2mm] z-10'>
                                <ImageUploadBox
                                    // 🏆 修正4: ロゴ画像のタイトルとプレースホルダーテキストを空にする
                                    title="" 
                                    image={logoImage}
                                    setImageState={setLogoImage}
                                    fileInputRef={logoFileInputRef}
                                    placeholderText="" 
                                    // 🚀 ロゴ画像のサイズを拡大 (画面: w-24->w-40, h-12->h-20 / 印刷: w-20->w-32, h-10->h-16)
                                    // 修正適用
                                    boxClassName="!w-40 !h-20 border-gray-400 print:!w-32 print:!h-16 print:border print:border-black print:flex-shrink-0"
                                    imgClassName="!w-full !h-full"
                                />
                            </div>

                            <div className="text-center pb-4 border-b-2 border-blue-800 mb-4 print:mb-3 print:pb-3">
                                {/* タイトルは「保証書」 */}
                                <h1 className="text-3xl font-extrabold mb-1 tracking-widest text-gray-800 print:text-2xl print:mb-0">保 証 書</h1> 
                                <p className="text-sm text-gray-600 print:text-xs">株式会社ピコイ　新築防蟻工事</p>
                                
                                <div 
                                    className="inline-block bg-gradient-to-r from-blue-700 to-blue-500 text-white px-8 py-2 mt-3 rounded-xl text-xl font-bold tracking-wider shadow-lg print:text-lg print:px-6 print:py-1 print:mt-2"
                                    style={{ fontFamily: "'Helvetica Neue LT Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                                >
                                    ICOSA strong system
                                </div>
                                
                                <div className="inline-block bg-yellow-600 text-white text-sm font-bold px-4 py-1 mt-3 rounded-full print:text-xs print:mt-1 print:px-3">
                                    🛡️ 20年保証
                                </div>
                            </div>

                            <div className="text-center text-sm mb-4 leading-snug print:text-xs print:mb-3">
                                このたび、お客様の大切なお住まいにおいて、株式会社ピコイが<br />
                                「<strong className="text-blue-700">ICOSA strong system</strong>」に基づく新築防蟻工事を実施いたしましたことを証明いたします。<br />
                                併せて、本工事は<strong className="text-red-600">20年間の保証対象</strong>となりますことをここに明記いたします。
                            </div>

                            {/* 施工物件セクション */}
                            <div className="border border-blue-200 rounded-md p-3 mb-4 bg-blue-50/50 print:p-2 print:mb-3">
                                <h2 className="text-base font-bold text-blue-700 mb-2 flex items-center print:text-sm print:mb-1">
                                    <span className="mr-2 text-xl leading-none print:text-lg">■</span> 施工物件
                                </h2>
                                <FieldRow 
                                    label="物件No" 
                                    value={currentData.propertyNo || '（手動編集ボタンで入力してください）'} 
                                />
                                <FieldRow 
                                    label="物件名" 
                                    value={currentData.propertyName || '（手動編集ボタンで入力してください）'} 
                                />
                                <FieldRow 
                                    label="所在地" 
                                    value={currentData.propertyLocation || '（手動編集ボタンで入力してください）'} 
                                />
                                {/* 💡 ビルダー様名 */}
                                <FieldRow 
                                    label="ビルダー様名" 
                                    value={currentData.builderName || '（手動編集ボタンで入力してください）'} 
                                />
                            </div>

                            {/* 施工内容セクション */}
                            <div className="border border-blue-200 rounded-md p-3 mb-4 bg-blue-50/50 print:p-2 print:mb-3">
                                <h2 className="text-base font-bold text-blue-700 mb-2 flex items-center print:text-sm print:mb-1">
                                    <span className="mr-2 text-xl leading-none print:text-lg">■</span> 施工内容
                                </h2>
                                <FieldRow label="工事項目" value="新築防蟻工事" />
                                <FieldRow label="工法" value="ICOSA strong system" />
                                <FieldRow 
                                    label="施工日" 
                                    value={currentData.constructionDate || '（手動編集ボタンで入力してください）'} 
                                />
                                {/* 🏆 A4フィット調整: マージンを削減 */}
                                <div className="mt-3 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-sm print:text-xs print:mt-1 print:p-2">
                                    <strong>保証期間:</strong> 施工日より <strong className="text-lg text-red-600 print:text-base">20年間</strong>
                                    <span className="ml-2 text-red-600 font-bold print:text-[11px] print:font-normal">
                                        (防蟻工事完了日より10年経過時の点検は必須となります。)
                                    </span>
                                </div>
                            </div>

                            {/* 保証内容セクション */}
                            <div className="border border-blue-200 rounded-md p-3 mb-4 bg-blue-50/50 print:p-2 print:mb-3">
                                <h2 className="text-base font-bold text-blue-700 mb-2 flex items-center print:text-sm print:mb-1">
                                    <span className="mr-2 text-xl leading-none print:text-lg">■</span> 保証内容
                                </h2>
                                {/* 🏆 A4フィット調整: テキストサイズと行間を調整 */}
                                <div className="text-sm space-y-2 print:text-[11px] print:space-y-1">
                                    <div className="relative pl-4">
                                        <span className="absolute left-0 top-0 text-blue-500 font-bold">1)</span>
                                        <p className='pl-2'>
                                            保証条件の各条件を充たしているにも関わらず、弊社の製品(工法)の欠陥に起因して、対象建物に
                                            <span className='align-super text-[0.6em] leading-none print:text-[0.5em]'>※1）</span>
                                            シロアリ被害が発生した場合には、駆除費用を負担、および建築修復費用として対象建物1戸あたり最大1000万円
                                            <span className='align-super text-[0.6em] leading-none print:text-[0.5em]'>※2）</span>
                                            を限度として負担する。
                                        </p>
                                    </div>
                                    <div className="relative pl-4">
                                        <span className="absolute left-0 top-0 text-blue-500 font-bold">2)</span>
                                        <p className='pl-2'>
                                            建築修復費用は、対象建物の主要な木造部分ならびに下地構造補助部分の合理的な補修に要する工事費用に限り支払の対象とする。
                                            書籍・家具類等の動産がシロアリ被害にあっても保証の対象とはならない。
                                        </p>
                                    </div>
                                    {/* 🏆 A4フィット調整: マージンを削減 */}
                                    <div className="mt-3 p-2 border border-gray-300 text-xs bg-white print:p-1 print:mt-1">
                                        <p className="mb-1 print:mb-0">
                                            <span className='align-super text-[0.6em] leading-none mr-0.5 font-bold text-red-600 print:text-[0.5em]'>※1）</span>
                                            対象とするシロアリ被害はヤマトシロアリ又は、イエシロアリに関する被害に限る。
                                        </p>
                                        <p>
                                            <span className='align-super text-[0.6em] leading-none mr-0.5 font-bold text-red-600 print:text-[0.5em]'>※2）</span>
                                            保証適用の判断、シロアリ被害部の復旧に係る工事費用の見積の査定は弊社で行うものとする。
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {/* /保証内容セクション */}

                            {/* 発行元/QRコードセクション */}
                            <div className="grid grid-cols-2 gap-4 print:gap-2">
                                <div className="text-xs leading-snug print:text-[11px]">
                                    <h2 className="text-base font-bold text-blue-700 mb-2 print:text-sm print:mb-1">発行</h2>
                                    <strong className="text-sm print:text-xs">株式会社ピコイ</strong><br />
                                    〒101-0042<br />
                                    東京都千代田区神田東松下町17<br />
                                    TEL: 03-6635-1782<br />
                                    FAX: 03-6635-1781<br />
                                    <a href="https://www.picoi.co.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 print:text-gray-700 print:no-underline">https://www.picoi.co.jp/</a>

                                    <div className="mt-2"> {/* 🏆 A4フィット調整: マージンを削減 */}
                                        <FieldRow 
                                            label="施工店" 
                                            value={constructionStore} 
                                            className="inline-flex w-auto !mb-0" 
                                        />
                                    </div>
                                </div>

                                <div className="border-2 border-dashed border-blue-400 p-2 rounded-lg bg-blue-50 text-center print:border print:border-gray-300 print:p-1">
                                    <ImageUploadBox
                                        // 🏆 修正5: titleを復活させる
                                        title="お客様登録はこちら" // <- このタイトルが印刷時に表示されます
                                        image={qrImage}
                                        setImageState={setQrImage}
                                        fileInputRef={qrFileInputRef}
                                        // 🏆 修正5: placeholderTextを復活させる
                                        placeholderText="(クリックで挿入)"
                                        // 🏆 A4フィット調整: 画像エリアを小さく
                                        boxClassName="rounded-lg !w-24 !h-24 print:!w-20 print:!h-20 print:mx-auto print:mb-1"
                                        imgClassName="!w-full !h-full"
                                    />
                                    {/* 🏆 修正6: QRコード下の注意書きを復活させる */}
                                    <p className="text-xs text-red-600 font-semibold mt-1 leading-snug print:text-[9px] print:text-gray-700 print:font-normal">
                                        ※本保証適用には「お客様登録」が必要です。<br />QRコードよりご登録ください。
                                    </p>
                                </div>
                            </div>

                            {/* 発行日/会社印セクション */}
                            <div className="flex justify-between items-end mt-4 pt-3 border-t border-gray-200 print:mt-3 print:pt-2">
                                <div className="text-sm text-gray-700 print:text-xs">
                                    発行日: <FieldRow value={issuanceDate} className="inline-flex w-auto !mb-0" />
                                </div>

                                <ImageUploadBox
                                    // 🏆 修正4: 会社印のタイトルとプレースホルダーテキストを空にする
                                    title=""
                                    image={sealImage}
                                    setImageState={setSealImage}
                                    fileInputRef={sealFileInputRef}
                                    placeholderText=""
                                    // 🚀 会社印のサイズ (横長)
                                    boxClassName="!w-32 !h-16 border-gray-400 print:!w-24 print:!h-12 print:border print:border-black print:flex-shrink-0"
                                    imgClassName="!w-full !h-full"
                                />
                            </div>

                            {/* 注意書き */}
                            <div className="mt-6 pt-3 border-t border-dashed border-gray-400 text-xs text-gray-600 space-y-2 print:mt-3 print:pt-1 print:space-y-1">
                                <div className="flex">
                                    <span className="mr-2 text-red-500 print:text-gray-600">※</span>
                                    <span>本保証書は保証規定書と併せて大切に保管ください。</span>
                                </div>
                                <div className="flex">
                                    <span className="mr-2 text-red-500 print:text-gray-600">※</span>
                                    <span>保証内容の詳細につきましては、保証規定書をご確認ください。</span>
                                </div>
                            </div>

                        </div> {/* /.print-front-page */}


                        {/* 裏面要素: 画面上でも確認可能、印刷時に2ページ目 */}
                        <div className="bg-white print-back-page border-4 border-double border-red-800 mt-10 print:mt-0">
                            
                            <div className="print-hidden mb-6 p-4 border border-red-300 rounded-lg bg-red-50">
                                <label className="block text-sm font-bold mb-2 text-red-700">【裏面】免責事項 リスト編集エリア</label>
                                
                                {isLocked ? (
                                    <div className="flex flex-col items-center justify-center p-6 bg-red-100 rounded-md h-56">
                                        <p className="text-red-700 font-bold mb-4">🔐 編集エリアはロックされています</p>
                                        {unlockError && <p className="text-sm text-red-500 mb-2">{unlockError}</p>}
                                        <input
                                            type="password"
                                            value={unlockKeyInput}
                                            onChange={(e) => {
                                                setUnlockKeyInput(e.target.value);
                                                setUnlockError(''); 
                                            }}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') handleUnlock();
                                            }}
                                            placeholder="ロック解除キーを入力"
                                            className="p-2 border border-red-300 rounded-md mb-3 text-center"
                                        />
                                        <button
                                            onClick={handleUnlock}
                                            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                                        >
                                            ロック解除
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <textarea
                                            value={backPageListText}
                                            onChange={(e) => setBackPageListText(e.target.value)}
                                            rows={10}
                                            className="w-full p-2 border border-red-300 rounded-md text-sm font-mono focus:border-red-500 resize-y"
                                            placeholder="各項目を改行で区切って入力してください。\n例:\n1) ヤマトシロアリまたはイエシロアリ以外の害虫...\n例：地震によるコンクリートのクラック"
                                        />
                                        <p className="text-xs text-gray-500 mt-2">※改行でリスト項目として認識されます。項目番号（例: `1)`）と「例：」が自動で整形されます。</p>
                                        <button 
                                            onClick={() => {
                                                if (window.confirm('編集を終了し、エリアをロックしますか？')) {
                                                    setIsLocked(true);
                                                }
                                            }}
                                            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                                        >
                                            [編集完了/ロックする]
                                        </button>
                                    </>
                                )}
                            </div>

                            <h2 className="text-xl font-extrabold mb-4 text-center tracking-wider text-red-800 print:text-lg">免 責 事 項</h2>
                            
                            <p className="text-sm font-bold mb-4 border-b pb-2 border-red-200 print:text-xs print:mb-2">\
                                以下のいずれかに該当する場合には、保証は適用されません。\
                            </p>
                            
                            {renderBackPageList(backPageListText)}

                        </div>
                    </div>
                </>
            )}
        </div>
    );
}