import { UI_LABELS_FR } from './uiLabels.fr';

type Labels = { [K in keyof typeof UI_LABELS_FR.auth.passwordPolicy]: string };
export const passwordPolicyTranslations: Record<string, Labels> = {
    fr: UI_LABELS_FR.auth.passwordPolicy,
    en: { tooLong: 'The new password must not exceed 72 UTF-8 bytes. Accented characters and emoji may count as several bytes.' },
    es: { tooLong: 'La nueva contraseña no debe superar los 72 bytes UTF-8. Los caracteres acentuados y los emojis pueden ocupar varios bytes.' },
    ko: { tooLong: '새 비밀번호는 UTF-8 기준 72바이트를 초과할 수 없습니다. 한글, 악센트가 있는 문자 및 이모지는 여러 바이트를 차지할 수 있습니다.' },
    vi: { tooLong: 'Mật khẩu mới không được vượt quá 72 byte UTF-8. Chữ có dấu và biểu tượng cảm xúc có thể chiếm nhiều byte.' },
    no: { tooLong: 'Det nye passordet kan ikke overstige 72 UTF-8-byte. Bokstaver med aksenter og emojier kan bruke flere byte.' },
    ja: { tooLong: '新しいパスワードはUTF-8で72バイト以内にしてください。日本語、アクセント付き文字、絵文字は複数バイトになる場合があります。' },
    zh: { tooLong: '新密码不得超过72个UTF-8字节。汉字、带重音的字符和表情符号可能占用多个字节。' },
    he: { tooLong: 'הסיסמה החדשה לא יכולה לחרוג מ־72 בתים בקידוד UTF-8. אותיות בעברית, תווים עם סימני הגייה ואימוג׳י עשויים לתפוס כמה בתים.' },
};
export const passwordPolicyLabels = (locale: string): Labels =>
    passwordPolicyTranslations[locale.toLowerCase().split('-')[0]] || passwordPolicyTranslations.en;
