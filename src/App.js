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

    const colMap = {
        '支店コード': headers.indexOf('支店コード'),
        '売上日': headers.indexOf('売上日'),
        '受注№': headers.indexOf('受注№'),
        '物件名': headers.indexOf('物件名'),
        'お客様住所': headers.indexOf('お客様住所'),
    };
    
    if (colMap['支店コード'] === -1) {
        console.error("CSVヘッダーに '支店コード' が見つかりません。");
        return [];
    }

    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = [];
        let inQuote = false;
        let start = 0;
        for (let j = 0; j < lines[i].length; j++) {
            if (lines[i][j] === '"') inQuote = !inQuote;
            else if (lines[i][j] === ',' && !inQuote) {
                values.push(lines[i].substring(start, j).replace(/"/g, '').trim());
                start = j + 1;
            }
        }
        values.push(lines[i].substring(start).replace(/"/g, '').trim());
        
        if (values.length > Math.max(...Object.values(colMap))) {
            
            const branchCode = values[colMap['支店コード']].trim();
            const rawPropertyName = values[colMap['物件名']].replace(/"/g, '').trim();

            data.push({
                isPrinted: false,
                isPDFGenerated: false,
                branchName: BRANCH_MAP[branchCode] || `支店コード:${branchCode} (未登録)`,
                propertyNo: values[colMap['受注№']].trim(),
                propertyName: rawPropertyName + (
                    rawPropertyName.endsWith('様') ||
                    rawPropertyName.endsWith('集合住宅') ||
                    rawPropertyName.endsWith('コーポ') ||
                    rawPropertyName.endsWith('号') 
                    ? '' : '様'
                ),
                propertyLocation: values[colMap['お客様住所']].replace(/"/g, '').trim(),
                constructionDate: formatConstructionDate(values[colMap['売上日']].trim()),
            });
        }
    }
    return data;
};

// --- 裏面リストの初期値定義 ---
const initialBackContent = `1. 建物及び、土壌が大きく移動・変形した場合、並びに津波・地震・噴火・洪水等の天災地変に起因するシロアリ被害
2. お客様、入居者及び第三者の故意又は重大な過失に起因するシロアリ被害
3. 建物増改築・移築・リフォーム等により、建物の床下等に侵入が不可能な箇所が生じた場合、並びに建物の一部または全部を取り壊した場合
4. 保証期間中に再施工の通知があったにもかかわらず、その施工を行わなかった場合
5. 建物内での水漏れ（給排水管、雨漏り等）を放置した場合
6. 本保証書に記載の物件及び保証範囲以外でシロアリの被害があった場合
7. 本保証規定を遵守しなかった場合`;


// --- FieldRow コンポーネント (IME入力安定化のための修正) ---
const FieldRow = memo(({ label, value, fieldKey, onChange, placeholder = '', className = '', isModal = false }) => {
    
    // スタイル調整
    const inputClassName = isModal 
        ? "flex-1 border border-gray-300 p-1 rounded focus:outline-none focus:border-blue-500 text-sm"
        : "flex-1 border-b border-gray-300 pb-[1px] pl-2 focus:outline-none focus:border-blue-500 print:border-b-0 print:border-gray-300 print:text-xs";
    
    const labelClassName = isModal
        ? "w-24 font-bold text-gray-600 text-sm flex-shrink-0"
        : "min-w-[100px] font-bold text-gray-600 print:min-w-[80px] print:text-xs";

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
        
        // IME入力中でない場合のみ、親の状態を更新する
        if (!isComposing && isModal && onChange && fieldKey) {
            onChange(fieldKey, e.target.value);
        }
    };

    // 3. IMEの開始
    const handleCompositionStart = () => setIsComposing(true);

    // 4. IMEの終了
    const handleCompositionEnd = (e) => {
        setIsComposing(false);
        
        // 変換が終了した時点で、親の状態を最終値で更新する
        if (isModal && onChange && fieldKey) {
            onChange(fieldKey, e.target.value);
        }
    };

    return (
        <div className={`flex items-baseline mb-2 text-sm leading-snug ${className}`}>
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
                    return stored;
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
    const [csvDataList, setCsvDataList] = useState(() => getStoredValue('csvDataList', []));
    
    const [currentData, setCurrentData] = useState(() => {
        const initialList = getStoredValue('csvDataList', []);
        if (initialList.length > 0) {
            const lastPropertyNo = getStoredValue('lastSelectedPropertyNo', null);
            const saved = initialList.find(d => d.propertyNo === lastPropertyNo);
            return saved || initialList[0];
        }
        return INITIAL_EMPTY_DATA;
    });

    const qrFileInputRef = useRef(null);
    const sealFileInputRef = useRef(null);
    const csvFileInputRef = useRef(null);

    const [issuanceDate, setIssuanceDate] = useState(() => getStoredValue('issuanceDate', getFormattedToday));
    const [constructionStore, setConstructionStore] = useState(() => getStoredValue('constructionStore', ''));
    const [backPageListText, setBackPageListText] = useState(() => getStoredValue('backPageListText', initialBackContent));

    // 既存の裏面編集ロック状態
    const [isLocked, setIsLocked] = useState(true);
    const [unlockKeyInput, setUnlockKeyInput] = useState('');
    const [unlockError, setUnlockError] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [tempData, setTempData] = useState({});

    // データの永続化と currentData の更新
    useEffect(() => {
        localStorage.setItem('qrImage', qrImage);
        localStorage.setItem('sealImage', sealImage);
        localStorage.setItem('issuanceDate', issuanceDate);
        localStorage.setItem('constructionStore', constructionStore);
        localStorage.setItem('backPageListText', backPageListText);
    }, [qrImage, sealImage, issuanceDate, constructionStore, backPageListText]);

    useEffect(() => {
        localStorage.setItem('csvDataList', JSON.stringify(csvDataList));
        if (csvDataList.length > 0) {
            const lastPropertyNo = getStoredValue('lastSelectedPropertyNo', null);
            const saved = csvDataList.find(d => d.propertyNo === lastPropertyNo);
            setCurrentData(saved || csvDataList[0]);
        } else {
            setCurrentData(INITIAL_EMPTY_DATA);
            localStorage.removeItem('lastSelectedPropertyNo');
        }
    }, [csvDataList]);

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
            } else {
                setCurrentData(INITIAL_EMPTY_DATA);
                setConstructionStore('');
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
            constructionStore
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
        };
        setCurrentData(newData);

        if (currentData.propertyNo) {
            updatePropertyInList(newData);
        } else if (tempData.propertyNo && csvDataList.length === 0) {
            // CSVが空で、手動入力されたpropertyNoがある場合、新しいデータとしてリストに追加
            setCsvDataList([newData]);
        }

        setIssuanceDate(tempData.issuanceDate);
        setConstructionStoreAndOverride(tempData.constructionStore);
        closeModal();
    };

    // --- 状態更新/印刷ハンドラ ---
    const updatePropertyStatus = (propertyNo, key, value) => {
        if (!propertyNo) return;
        setCsvDataList(list => list.map(d => d.propertyNo === propertyNo ? { ...d, [key]: value } : d));
        if (currentData.propertyNo === propertyNo) {
            setCurrentData(d => ({ ...d, [key]: value }));
        }
    };

    const handlePrint = () => {
        if (!currentData.propertyNo) {
            alert("物件番号がありません。手動編集してください。");
            return;
        }

        const originalTitle = document.title;
        document.title = `${currentData.propertyName}_施工証明書`;
        
        window.print();
        updatePropertyStatus(currentData.propertyNo, 'isPrinted', true);

        setTimeout(() => {
            document.title = originalTitle;
        }, 100);
    };

    const handlePDF = () => {
        if (!currentData.propertyNo) {
            alert("物件番号がありません。手動編集してください。");
            return;
        }

        const originalTitle = document.title;
        document.title = `${currentData.propertyName}_施工証明書(PDF)`;
        
        window.print();
        updatePropertyStatus(currentData.propertyNo, 'isPDFGenerated', true);

        setTimeout(() => {
            document.title = originalTitle;
        }, 100);
    };
    
    const handleBatchPrint = async () => {
        if (csvDataList.length === 0) {
            alert("印刷対象データがありません。");
            return;
        }

        if (!window.confirm(`${csvDataList.length}件を連続印刷しますか？`)) return;

        const originalData = currentData;
        const originalStore = constructionStore;
        
        for (const data of csvDataList) {
            setCurrentData(data);
            setConstructionStore(data.branchName);
            localStorage.removeItem('constructionStore_manual_override');

            const originalTitle = document.title;
            document.title = `${data.propertyName}_施工証明書`;
            
            await new Promise(r => setTimeout(r, 100));
            window.print();

            document.title = originalTitle; 
            
            updatePropertyStatus(data.propertyNo, 'isPrinted', true);
        }

        setCurrentData(originalData);
        setConstructionStore(originalStore);
        alert("一括印刷が完了しました。");
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
            <strong className="text-blue-800 text-sm">{title}</strong>
            <div
                className={`w-32 h-32 border-2 border-dashed border-blue-400 bg-white shadow-inner cursor-pointer flex items-center justify-center m-2 overflow-hidden print:border-none print:shadow-none print:m-0 print:p-0 ${boxClassName}`}
                onClick={() => fileInputRef.current.click()}
                style={image ? { printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact', border: '1px solid #000', backgroundColor: 'white' } : {}}
            >
                {image ? (
                    <img src={image} alt={title} className={`object-contain ${imgClassName}`} />
                ) : (
                    <div className="text-center text-xs text-gray-400 p-2"> 
                        <Upload className="w-5 h-5 mx-auto mb-1" />
                        {placeholderText.split('\n').map((line, i) => <p key={i}>{line}</p>)}
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

    const renderBackPageList = (text) => {
        const items = text.split('\n').filter(line => line.trim() !== '');
        return (
            <ol className="list-decimal pl-6 space-y-3 text-sm print:text-xs print:space-y-1">
                {items.map((item, index) => {
                    const content = item.replace(/^\d+\.\s*/, '').trim();
                    return (
                        <li key={index} className='font-medium'>
                            <strong className='text-red-600 print:text-black'>{content}</strong>
                        </li>
                    );
                })}
            </ol>
        );
    };

    // 💡 手動編集用モーダルコンポーネント
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
                        <FieldRow label="施工日" value={tempData.constructionDate || ''} fieldKey="constructionDate" onChange={handleTempChange} isModal={true} placeholder="例: 2024年01月23日"/>
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
                         <FieldRow label="発行日" value={tempData.issuanceDate || ''} fieldKey="issuanceDate" onChange={handleTempChange} isModal={true} placeholder="例: 2024年01月23日"/>
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
                                display: none;
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
                                height: 275mm; 
                                margin: 11mm auto !important; 
                                padding: 24px; 
                                box-shadow: none !important;
                                box-sizing: border-box; 
                            }

                            .print-back-page {
                                page-break-before: always; 
                                border: 4px double #B91C1C !important;
                            }

                            .print-front-page {
                                border: 4px double #1D4ED8 !important;
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
                                className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition duration-200 mb-2"
                            >
                                <Printer className="w-5 h-5" />
                                <span>全件印刷（PDF作成）</span>
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
                                                <div className='flex space-x-3'>
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
                        <div className='print-front-page border-4 border-double border-blue-800'> 

                            <div className="text-center pb-4 border-b-2 border-blue-800 mb-6 print:mb-4">
                                <h1 className="text-3xl font-extrabold mb-1 tracking-widest text-gray-800 print:text-2xl print:mb-0">施 工 証 明 書</h1>
                                <p className="text-sm text-gray-600 print:text-xs">株式会社ピコイ　新築防蟻工事</p>
                                
                                <div 
                                    className="inline-block bg-gradient-to-r from-blue-700 to-blue-500 text-white px-8 py-2 mt-3 rounded-xl text-xl font-bold tracking-wider shadow-lg print:text-lg print:px-6 print:py-1 print:mt-2"
                                    style={{ fontFamily: "'Helvetica Neue LT Pro', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                                >
                                    ICOSA strong system
                                </div>
                                
                                <div className="inline-block bg-yellow-600 text-white text-sm font-bold px-4 py-1 mt-2 rounded-full print:text-xs print:mt-1 print:px-3">
                                    🛡️ 20年保証
                                </div>
                            </div>

                            <div className="text-center text-sm mb-6 leading-snug print:text-xs print:mb-4">
                                このたび、お客様の大切なお住まいにおいて、株式会社ピコイが<br />
                                「<strong className="text-blue-700">ICOSA strong system</strong>」に基づく新築防蟻工事を実施いたしましたことを証明いたします。<br />
                                併せて、本工事は<strong className="text-red-600">20年間の保証対象</strong>となりますことをここに明記いたします。
                            </div>

                            <div className="border border-blue-200 rounded-md p-4 mb-6 bg-blue-50/50 print:p-2 print:mb-4">
                                <h2 className="text-base font-bold text-blue-700 mb-3 flex items-center print:text-sm print:mb-2">
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
                            </div>

                            <div className="border border-blue-200 rounded-md p-4 mb-6 bg-blue-50/50 print:p-2 print:mb-4">
                                <h2 className="text-base font-bold text-blue-700 mb-3 flex items-center print:text-sm print:mb-2">
                                    <span className="mr-2 text-xl leading-none print:text-lg">■</span> 施工内容
                                </h2>
                                <FieldRow label="工事項目" value="新築防蟻工事" />
                                <FieldRow label="工法" value="ICOSA strong system" />
                                <FieldRow 
                                    label="施工日" 
                                    value={currentData.constructionDate || '（手動編集ボタンで入力してください）'} 
                                />
                                <div className="mt-4 p-3 bg-yellow-100 border-l-4 border-yellow-500 text-sm print:text-xs print:mt-2 print:p-2">
                                    <strong>保証期間:</strong> 施工日より <strong className="text-lg text-red-600 print:text-base">20年間</strong>
                                </div>
                            </div>

                            <div className="border border-blue-200 rounded-md p-4 mb-6 bg-blue-50/50 print:p-2 print:mb-4">
                                <h2 className="text-base font-bold text-blue-700 mb-3 flex items-center print:text-sm print:mb-2">
                                    <span className="mr-2 text-xl leading-none print:text-lg">■</span> 保証範囲
                                </h2>
                                <ul className="text-sm ml-6 list-none space-y-1 print:text-xs print:space-y-0.5">
                                    <li className="relative pl-4"><span className="absolute left-0 top-0 text-blue-500">•</span> シロアリによる建物への被害に関して、保証規定に基づき対応いたします。</li>
                                    <li className="relative pl-4"><span className="absolute left-0 top-0 text-blue-500">•</span> 保証の詳細条件につきましては、別途「保証規定書」をご確認ください。</li>
                                </ul>
                            </div>

                            <div className="grid grid-cols-2 gap-4 print:gap-2">
                                <div className="text-xs leading-snug">
                                    <h2 className="text-base font-bold text-blue-700 mb-2 print:text-sm print:mb-1">発行</h2>
                                    <strong className="text-sm print:text-xs">株式会社ピコイ</strong><br />
                                    〒101-0042<br />
                                    東京都千代田区神田東松下町17<br />
                                    TEL: 03-6635-1782<br />
                                    FAX: 03-6635-1781<br />
                                    <a href="https://www.picoi.co.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 print:text-gray-700 print:no-underline">https://www.picoi.co.jp/</a>

                                    <div className="mt-3">
                                        <FieldRow 
                                            label="施工店" 
                                            value={constructionStore} 
                                            className="inline-flex w-auto !mb-0" 
                                        />
                                    </div>
                                </div>

                                <div className="border-2 border-dashed border-blue-400 p-2 rounded-lg bg-blue-50 text-center print:border print:border-gray-300 print:p-1">
                                    <ImageUploadBox
                                        title="お客様登録はこちら"
                                        image={qrImage}
                                        setImageState={setQrImage}
                                        fileInputRef={qrFileInputRef}
                                        placeholderText="QRコード\n配置場所\n(クリックで挿入)"
                                        boxClassName="rounded-lg !w-28 !h-28 print:!w-24 print:!h-24 print:mx-auto print:mb-1"
                                        imgClassName="!w-full !h-full"
                                    />
                                    <p className="text-xs text-red-600 font-semibold mt-1 leading-snug print:text-[10px] print:text-gray-700 print:font-normal">
                                        ※本保証適用には「お客様登録」が必要です。<br />QRコードよりご登録ください。
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between items-end mt-6 pt-4 border-t border-gray-200 print:mt-4 print:pt-2">
                                <div className="text-sm text-gray-700 print:text-xs">
                                    発行日: <FieldRow value={issuanceDate} className="inline-flex w-auto !mb-0" />
                                </div>

                                <ImageUploadBox
                                    title="会社印"
                                    image={sealImage}
                                    setImageState={setSealImage}
                                    fileInputRef={sealFileInputRef}
                                    placeholderText="会社印\n(クリックで挿入)"
                                    boxClassName="!w-20 !h-12 border-gray-400 print:!w-16 !h-10 print:border print:border-black print:flex-shrink-0"
                                    imgClassName="!w-full !h-full"
                                />
                            </div>

                            <div className="mt-8 pt-4 border-t border-dashed border-gray-400 text-xs text-gray-600 space-y-2 print:mt-4 print:pt-2 print:space-y-1">
                                <div className="flex">
                                    <span className="mr-2 text-red-500 print:text-gray-600">※</span>
                                    <span>本証明書は保証規定書と併せて大切に保管ください。</span>
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
                                <label className="block text-sm font-bold mb-2 text-red-700">【裏面】保証失効事項 リスト編集エリア</label>
                                
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
                                            placeholder="各項目を改行で区切って入力してください。\n例:\n1. 建物及び、土壌が大きく移動・変形した場合...\n2. お客様、入居者及び第三者の故意又は重大な過失..."
                                        />
                                        <p className="text-xs text-gray-500 mt-2">※改行でリスト項目として認識されます。先頭に番号（例: `1. `）を入力すると、自動で削除し、HTMLリストの番号を優先します。</p>
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

                            <h2 className="text-xl font-extrabold mb-4 text-center tracking-wider text-red-800 print:text-lg">保 証 失 効 事 項</h2>
                            
                            <p className="text-sm font-bold mb-4 border-b pb-2 border-red-200 print:text-xs print:mb-2">
                                本保証は、次の事項が発生した時点で失効します。
                            </p>
                            
                            {renderBackPageList(backPageListText)}

                            <div className="mt-12 text-right text-xs text-gray-500 border-t pt-2 print:mt-8 print:pt-1">
                                &mdash; **保証規定 (裏面)** &mdash;
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}