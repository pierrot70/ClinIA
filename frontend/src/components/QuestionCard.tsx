import React from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "../hooks/useTranslation";
import {
  getImmediateEnglishClinicalContent,
  shouldHideFrenchSourceInEnglish,
} from "../i18n/clinicalContentEnglish";

interface Props {
  question: string;
  answer: string;
  language?: "fr" | "en";
}

const QuestionCard: React.FC<Props> = ({ question, answer, language = "fr" }) => {
  const questionTranslation = useTranslation({ text: question, targetLang: language });
  const answerTranslation = useTranslation({ text: answer, targetLang: language });
  const english = language === "en";
  const displayEnglishText = (
    source: string,
    translated: string,
    fallback: string
  ) => {
    const immediate = getImmediateEnglishClinicalContent(source);
    if (immediate) return immediate;
    if (!shouldHideFrenchSourceInEnglish(source)) return source;
    if (
      translated !== source &&
      !shouldHideFrenchSourceInEnglish(translated)
    ) {
      return translated;
    }
    return fallback;
  };
  const displayedQuestion = english
    ? displayEnglishText(
        question,
        questionTranslation.translated,
        "Additional clinical question"
      )
    : questionTranslation.translated;
  const displayedAnswer = english
    ? displayEnglishText(
        answer,
        answerTranslation.translated,
        "Review the clinical details provided for this question."
      )
    : answerTranslation.translated;

  return (
    <details className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <summary className="flex items-center justify-between gap-2 cursor-pointer">
        <span className="text-sm font-medium text-gray-800">
          {displayedQuestion}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-400 group-open:rotate-90 transition-transform" />
      </summary>
      <div className="mt-2 text-sm text-gray-700">
        {displayedAnswer}
      </div>
    </details>
  );
};

export default QuestionCard;
