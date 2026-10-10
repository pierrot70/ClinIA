import { UI_LABELS_FR } from "./uiLabels.fr";
import { baseUiLocale } from "./uiLocales";
const languages = ["en", "es", "ko", "vi", "no", "ja", "zh", "he"] as const;
type Row = readonly [string, string, string, string, string, string, string, string];
const rows: Record<keyof typeof UI_LABELS_FR.header.voice.feedback, Row> = {
  heard: ['Heard: "{text}"', 'Oído: "{text}"', '인식: "{text}"', 'Đã nghe: "{text}"', 'Hørt: "{text}"', '認識: 「{text}」', '听到：“{text}”', 'נשמע: "{text}"'],
  navigation: ["Navigation: {label}", "Navegación: {label}", "이동: {label}", "Điều hướng: {label}", "Navigasjon: {label}", "移動: {label}", "导航：{label}", "ניווט: {label}"],
  command: ["Command: {label}", "Comando: {label}", "명령: {label}", "Lệnh: {label}", "Kommando: {label}", "コマンド: {label}", "命令：{label}", "פקודה: {label}"],
  translating: ["Translating home ({language})...", "Traduciendo inicio ({language})...", "홈 번역 중 ({language})...", "Đang dịch trang chủ ({language})...", "Oversetter startsiden ({language})...", "ホームを翻訳中（{language}）...", "正在翻译首页（{language}）...", "מתרגם את דף הבית ({language})..."],
  translated: ["Home translated ({language}).", "Inicio traducido ({language}).", "홈 번역 완료 ({language}).", "Đã dịch trang chủ ({language}).", "Startsiden er oversatt ({language}).", "ホームを翻訳しました（{language}）。", "首页已翻译（{language}）。", "דף הבית תורגם ({language})."],
  homeFrench: ["Home in French.", "Inicio en francés.", "프랑스어 홈.", "Trang chủ bằng tiếng Pháp.", "Startsiden på fransk.", "ホームはフランス語です。", "法语首页。", "דף הבית בצרפתית."],
  unrecognizedLanguage: ["Language not recognized; returning to French.", "Idioma no reconocido; volviendo al francés.", "언어를 인식하지 못했습니다. 프랑스어로 돌아갑니다.", "Không nhận ra ngôn ngữ; trở về tiếng Pháp.", "Språket ble ikke gjenkjent; går tilbake til fransk.", "言語を認識できません。フランス語に戻ります。", "未识别语言，返回法语。", "השפה לא זוהתה; חוזר לצרפתית."],
  dictationStarting: ["Enabling dictation mode...", "Activando modo dictado...", "받아쓰기 모드 활성화 중...", "Đang bật đọc chính tả...", "Aktiverer diktering...", "音声入力を有効化中...", "正在启用听写...", "מפעיל הכתבה..."],
  captured: ["Diagnosis captured.", "Diagnóstico capturado.", "진단이 입력되었습니다.", "Đã ghi nhận chẩn đoán.", "Diagnosen er registrert.", "診断を記録しました。", "诊断已记录。", "האבחנה נקלטה."],
  unrecognizedCommand: ['Command not recognized: "{text}"', 'Comando no reconocido: "{text}"', '명령을 인식하지 못함: "{text}"', 'Không nhận ra lệnh: "{text}"', 'Kommando ikke gjenkjent: "{text}"', 'コマンドを認識できません: 「{text}」', '未识别命令：“{text}”', 'הפקודה לא זוהתה: "{text}"'],
  microphoneActive: ["Microphone active; speak now...", "Micrófono activo; hable ahora...", "마이크 활성화됨. 말씀하세요...", "Micro đang hoạt động; hãy nói...", "Mikrofonen er aktiv; snakk nå...", "マイクが有効です。話してください...", "麦克风已启用，请说话...", "המיקרופון פעיל; דבר כעת..."],
  noRecognition: ["No speech recognition.", "Sin reconocimiento de voz.", "음성 인식 결과가 없습니다.", "Không có nhận dạng giọng nói.", "Ingen talegjenkjenning.", "音声認識結果はありません。", "无语音识别结果。", "אין זיהוי דיבור."],
  inaccessible: ["Microphone inaccessible. Check browser and OS permissions.", "Micrófono inaccesible. Verifique los permisos del navegador y del sistema operativo.", "마이크에 접근할 수 없습니다. 브라우저와 운영체제 권한을 확인하세요.", "Không thể truy cập micro. Kiểm tra quyền trình duyệt và hệ điều hành.", "Mikrofonen er utilgjengelig. Kontroller tillatelser i nettleser og operativsystem.", "マイクにアクセスできません。ブラウザーとOSの権限を確認してください。", "无法访问麦克风。请检查浏览器和操作系统权限。", "אין גישה למיקרופון. בדוק הרשאות בדפדפן ובמערכת ההפעלה."],
  noSpeech: ["No speech detected.", "No se detectó voz.", "음성이 감지되지 않았습니다.", "Không phát hiện giọng nói.", "Ingen tale oppdaget.", "音声が検出されませんでした。", "未检测到语音。", "לא זוהה דיבור."],
  voiceError: ["Voice error: {error}", "Error de voz: {error}", "음성 오류: {error}", "Lỗi giọng nói: {error}", "Talefeil: {error}", "音声エラー: {error}", "语音错误：{error}", "שגיאת קול: {error}"],
  stoppedSilence: ["Listening stopped (silence).", "Escucha detenida (silencio).", "듣기 중지됨 (무음).", "Đã dừng nghe (im lặng).", "Lyttingen er stoppet (stillhet).", "無音のため音声認識を停止しました。", "已停止监听（静音）。", "ההאזנה הופסקה (שתיקה)."],
  apiUnavailable: ["Microphone API unavailable in this browser.", "API de micrófono no disponible en este navegador.", "이 브라우저에서 마이크 API를 사용할 수 없습니다.", "API micro không khả dụng trên trình duyệt này.", "Mikrofon-API er utilgjengelig i denne nettleseren.", "このブラウザーではマイクAPIを利用できません。", "此浏览器的麦克风API不可用。", "API המיקרופון אינו זמין בדפדפן זה."],
  persistentEnabled: ["Persistent listening enabled.", "Escucha persistente activada.", "지속 듣기가 활성화되었습니다.", "Đã bật nghe liên tục.", "Vedvarende lytting er aktivert.", "継続的な音声認識を有効にしました。", "已启用持续监听。", "האזנה רציפה הופעלה."],
  permissionDenied: ["Microphone permission denied: {error}", "Permiso de micrófono denegado: {error}", "마이크 권한 거부: {error}", "Quyền micro bị từ chối: {error}", "Mikrofontillatelse avslått: {error}", "マイクの権限が拒否されました: {error}", "麦克风权限被拒绝：{error}", "הרשאת המיקרופון נדחתה: {error}"],
  unknownError: ["unknown", "desconocido", "알 수 없음", "không rõ", "ukjent", "不明", "未知", "לא ידוע"],
  persistentDisabled: ["Persistent listening disabled.", "Escucha persistente desactivada.", "지속 듣기가 비활성화되었습니다.", "Đã tắt nghe liên tục.", "Vedvarende lytting er deaktivert.", "継続的な音声認識を無効にしました。", "已禁用持续监听。", "האזנה רציפה בוטלה."],
  microphoneError: ["Microphone inaccessible: {error}.", "Micrófono inaccesible: {error}.", "마이크 접근 불가: {error}.", "Không thể truy cập micro: {error}.", "Mikrofonen er utilgjengelig: {error}.", "マイクにアクセスできません: {error}。", "无法访问麦克风：{error}。", "אין גישה למיקרופון: {error}."],
  testError: ["Microphone test failed: {error}.", "Falló la prueba de micrófono: {error}.", "마이크 테스트 실패: {error}.", "Kiểm tra micro thất bại: {error}.", "Mikrofontesten mislyktes: {error}.", "マイクのテストに失敗しました: {error}。", "麦克风测试失败：{error}。", "בדיקת המיקרופון נכשלה: {error}."],
  navigationUnavailable: ["Voice navigation unavailable.", "Navegación por voz no disponible.", "음성 탐색을 사용할 수 없습니다.", "Điều hướng giọng nói không khả dụng.", "Talenavigasjon er utilgjengelig.", "音声ナビゲーションを利用できません。", "语音导航不可用。", "ניווט קולי אינו זמין."],
  listening: ["Listening...", "Escuchando...", "듣는 중...", "Đang nghe...", "Lytter...", "音声認識中...", "正在监听...", "מאזין..."],
  startFailed: ["Microphone startup failed.", "Falló el inicio del micrófono.", "마이크 시작에 실패했습니다.", "Khởi động micro thất bại.", "Oppstart av mikrofonen mislyktes.", "マイクを起動できませんでした。", "麦克风启动失败。", "הפעלת המיקרופון נכשלה."],
  apiHint: ["Microphone API unavailable. Try Chrome/HTTPS/localhost.", "API de micrófono no disponible. Pruebe Chrome/HTTPS/localhost.", "마이크 API를 사용할 수 없습니다. Chrome/HTTPS/localhost를 사용해 보세요.", "API micro không khả dụng. Thử Chrome/HTTPS/localhost.", "Mikrofon-API er utilgjengelig. Prøv Chrome/HTTPS/localhost.", "マイクAPIを利用できません。Chrome/HTTPS/localhostを試してください。", "麦克风API不可用。请尝试Chrome/HTTPS/localhost。", "API המיקרופון אינו זמין. נסה Chrome/HTTPS/localhost."],
  unsupported: ["Voice navigation is not supported in this browser.", "Este navegador no admite navegación por voz.", "이 브라우저는 음성 탐색을 지원하지 않습니다.", "Trình duyệt này không hỗ trợ điều hướng giọng nói.", "Denne nettleseren støtter ikke talenavigasjon.", "このブラウザーは音声ナビゲーションに対応していません。", "此浏览器不支持语音导航。", "דפדפן זה אינו תומך בניווט קולי."],
  stopped: ["Listening stopped.", "Escucha detenida.", "듣기가 중지되었습니다.", "Đã dừng nghe.", "Lyttingen er stoppet.", "音声認識を停止しました。", "已停止监听。", "ההאזנה הופסקה."],
  audioUnavailable: ["AudioContext unavailable.", "AudioContext no disponible.", "AudioContext를 사용할 수 없습니다.", "AudioContext không khả dụng.", "AudioContext er utilgjengelig.", "AudioContextを利用できません。", "AudioContext不可用。", "AudioContext אינו זמין."],
  testActive: ["Microphone test active.", "Prueba de micrófono activa.", "마이크 테스트가 활성화되었습니다.", "Đang kiểm tra micro.", "Mikrofontesten er aktiv.", "マイクをテスト中です。", "麦克风测试已启用。", "בדיקת המיקרופון פעילה."],
  tooltip: ["Say: open appointments, patients, clinics or specialists; go home; execute; clear; stop", "Diga: abrir citas, pacientes, clínicas o especialistas; volver al inicio; ejecutar; borrar; detener", "말하기: 예약, 환자, 클리닉 또는 전문의 열기; 홈으로 이동; 실행; 지우기; 중지", "Nói: mở lịch hẹn, bệnh nhân, phòng khám hoặc chuyên gia; về trang chủ; thực thi; xóa; dừng", "Si: åpne avtaler, pasienter, klinikker eller spesialister; gå hjem; utfør; tøm; stopp", "話す内容：予約、患者、クリニック、専門医を開く、ホームに戻る、実行、消去、停止", "请说：打开预约、患者、诊所或专科医生；返回首页；执行；清除；停止", "אמור: פתח תורים, מטופלים, מרפאות או מומחים; חזור לדף הבית; הפעל; נקה; עצור"],
  dictation: ["Dictation", "Dictado", "받아쓰기", "Đọc chính tả", "Diktering", "音声入力", "听写", "הכתבה"],
  clear: ["Clear", "Borrar", "지우기", "Xóa", "Tøm", "消去", "清除", "נקה"],
  stop: ["Stop", "Detener", "중지", "Dừng", "Stopp", "停止", "停止", "עצור"],
};
export function localizeVoiceUiLabel(source: string, locale: string): string | null {
  const key = (Object.keys(rows) as (keyof typeof rows)[]).find(key => UI_LABELS_FR.header.voice.feedback[key] === source);
  if (!key) return null;
  const language = baseUiLocale(locale);
  if (language === "fr") return source;
  const index = languages.indexOf(language as typeof languages[number]);
  return index < 0 ? null : rows[key][index];
}

// Captured speech and browser error codes are data, never translation input.
export function formatVoiceUiStatus(source: string, translate: (text: string) => string, params: Record<string, string> = {}) {
  return translate(source).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (token, key) => {
    const value = params[key];
    if (value === undefined) return token;
    return key === "label" || value === UI_LABELS_FR.header.voice.feedback.unknownError ? translate(value) : value;
  });
}
