import React from 'react';
// ExampleQuestions.tsx

import { ChevronDown, ChevronUp } from 'lucide-react';
import { ExampleQuestionsProps } from './types';

export function ExampleQuestions({
  questions,
  expandedCategories,
  isBotResponding,
  onToggleCategory,
  onQuestionClick,
  isDarkMode,
}: ExampleQuestionsProps) {
  return (
    <div className="space-y-3">
      <p
        className={`text-sm text-center mb-4 ${
          isDarkMode ? 'text-gray-300' : 'text-gray-600'
        }`}
      >
        Hi! I'm CIROH AI. How can I help you today?
      </p>
      {questions.map((category, index) => (
        <div key={index} className="space-y-1 mb-1">
          <button
            onClick={() => onToggleCategory(index)}
            // --- CHANGED: Improved dark mode contrast for buttons ---
            className={`w-full text-left p-3 rounded-xl border transition-colors duration-200 group ${
              isDarkMode
                ? 'bg-white/5 hover:bg-white/10 border-white/10'
                : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
            }`}
            disabled={isBotResponding}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-bold ${
                  isDarkMode
                    ? 'text-gray-200'
                    : 'text-gray-700'
                }`}
              >
                {category.category}
              </span>
              {expandedCategories.has(index) ? (
                <ChevronUp
                  className={`h-4 w-4 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-400'
                  }`}
                />
              ) : (
                <ChevronDown
                  className={`h-4 w-4 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-400'
                  }`}
                />
              )}
            </div>
          </button>
          {expandedCategories.has(index) && (
            <div className="pt-1 pl-4 space-y-1">
              {category.questions.map((question, qIndex) => (
                <button
                  key={qIndex}
                  onClick={() => onQuestionClick(question)}
                  className={`w-full text-left p-2 rounded-lg border transition-colors duration-200 text-sm ${
                    isDarkMode
                      ? 'hover:bg-white/10 border-transparent text-gray-300 hover:text-white'
                      : 'bg-white hover:bg-gray-50 border-gray-100 text-gray-600 hover:text-gray-800'
                  }`}
                  disabled={isBotResponding}
                >
                  {question}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}