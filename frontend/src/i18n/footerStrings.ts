export type FooterStrings = {
  prototypeNotice: string;
  simulatedDataNotice: string;
  builtWithChatGPT: string;
  versionPrefix: string;
  buildPrefix: string;
};

const FOOTER_STRINGS: Record<string, FooterStrings> = {
  fr: {
    prototypeNotice:
      "© 2025 ClinIA - Prototype non destiné à un usage clinique réel.",
    simulatedDataNotice:
      "Conçu à des fins de démonstration avec des données simulées.",
    builtWithChatGPT:
      "ClinIA - fièrement créée avec ChatGPT.",
    versionPrefix: "Version",
    buildPrefix: "Compilation",
  },
  en: {
    prototypeNotice:
      "© 2025 ClinIA - Prototype not intended for real clinical use.",
    simulatedDataNotice:
      "Designed for demonstration using simulated data.",
    builtWithChatGPT:
      "ClinIA - proudly created with ChatGPT.",
    versionPrefix: "Version",
    buildPrefix: "Build",
  },
  es: {
    prototypeNotice:
      "© 2025 ClinIA - Prototipo no destinado al uso clínico real.",
    simulatedDataNotice:
      "Diseñado para demostraciones con datos simulados.",
    builtWithChatGPT:
      "ClinIA - creada con orgullo con ChatGPT.",
    versionPrefix: "Versión",
    buildPrefix: "Compilación",
  },
  ja: {
    prototypeNotice:
      "© 2025 ClinIA - 実際の臨床使用を目的としたものではありません。",
    simulatedDataNotice:
      "シミュレーションデータを使用したデモ用です。",
    builtWithChatGPT:
      "ClinIA - ChatGPTとともに誇りを持って作成。",
    versionPrefix: "バージョン",
    buildPrefix: "ビルド",
  },
  zh: {
    prototypeNotice:
      "© 2025 ClinIA - 原型系统，不适用于实际临床用途。",
    simulatedDataNotice:
      "使用模拟数据进行演示。",
    builtWithChatGPT:
      "ClinIA - 自豪地使用 ChatGPT 创建。",
    versionPrefix: "版本",
    buildPrefix: "构建",
  },
  he: {
    prototypeNotice:
      "© 2025 ClinIA - אב טיפוס שאינו מיועד לשימוש קליני ממשי.",
    simulatedDataNotice:
      "מיועד להדגמה באמצעות נתונים מדומים.",
    builtWithChatGPT:
      "ClinIA - נוצרה בגאווה עם ChatGPT.",
    versionPrefix: "גרסה",
    buildPrefix: "בנייה",
  },
  ko: {
    prototypeNotice:
      "© 2025 ClinIA - 실제 임상 사용을 위한 제품이 아닌 프로토타입입니다.",
    simulatedDataNotice:
      "시뮬레이션 데이터를 사용한 시연용입니다.",
    builtWithChatGPT:
      "ClinIA - ChatGPT와 함께 자랑스럽게 만들었습니다.",
    versionPrefix: "버전",
    buildPrefix: "빌드",
  },
  vi: {
    prototypeNotice:
      "© 2025 ClinIA - Bản mẫu không dành cho sử dụng lâm sàng thực tế.",
    simulatedDataNotice:
      "Được thiết kế để minh họa bằng dữ liệu mô phỏng.",
    builtWithChatGPT:
      "ClinIA - tự hào được tạo ra cùng ChatGPT.",
    versionPrefix: "Phiên bản",
    buildPrefix: "Bản dựng",
  },
  no: {
    prototypeNotice:
      "© 2025 ClinIA - Prototype som ikke er beregnet for faktisk klinisk bruk.",
    simulatedDataNotice:
      "Utformet for demonstrasjon med simulerte data.",
    builtWithChatGPT:
      "ClinIA - stolt skapt med ChatGPT.",
    versionPrefix: "Versjon",
    buildPrefix: "Bygg",
  },
};

export const getFooterStrings = (locale: string): FooterStrings =>
  FOOTER_STRINGS[String(locale || "fr").toLowerCase().split("-")[0]] ||
  FOOTER_STRINGS.en;
