import React from 'react';

const CATEGORIES = ['Podcasts', 'Sad', 'Relax', 'Romance', 'Energise', 'Workout', 'Focus'];

export function CategoryChips({ activeCategory, onSelectCategory }) {
  return (
    <nav aria-label="Category Filters" className="relative z-30 flex items-center space-x-2 px-4 py-2 overflow-x-auto no-scrollbar bg-transparent">
      {CATEGORIES.map((cat) => {
        const isActive = activeCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelectCategory && onSelectCategory(isActive ? null : cat)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-white text-black font-semibold shadow-md'
                : 'bg-yt-chip hover:bg-white/20 text-white'
            }`}
          >
            {cat}
          </button>
        );
      })}
    </nav>
  );
}
