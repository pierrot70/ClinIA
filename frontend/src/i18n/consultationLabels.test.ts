import {describe,expect,it} from "vitest";
import {UI_LABELS_FR} from "./uiLabels.fr";
import {UI_LOCALES,validUiTranslation} from "./uiLocales";
import {consultationLabels} from "./consultationLabels";
import {getLocalUiTranslation} from "./localUiTranslations";
describe("bounded collaboration note history label",()=>{
 it.each(UI_LOCALES)("keeps the 500-note warning local and complete in %s",locale=>{
  const source=UI_LABELS_FR.consultations.sharedNotesTruncated,value=consultationLabels(locale).sharedNotesTruncated;
  expect(validUiTranslation(source,value)).toBe(true);expect(value).toContain("500");expect(getLocalUiTranslation(source,locale)).toBe(value);
 });
});
