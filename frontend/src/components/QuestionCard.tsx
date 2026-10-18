import React from "react";
import { ChevronRight } from "lucide-react";

interface Props {
  question: string;
  answer: string;
  language?: string;
}

const QuestionCard: React.FC<Props> = ({ question, answer, language = "fr" }) => {

  return (
    <details className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
      <summary className="flex items-center justify-between gap-2 cursor-pointer">
        <span dir="auto" translate="no" className="text-sm font-medium text-gray-800">
          {question}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-400 group-open:rotate-90 transition-transform" />
      </summary>
      <div dir="auto" translate="no" className="mt-2 text-sm text-gray-700">
        {answer}
      </div>
    </details>
  );
};

export default QuestionCard;
