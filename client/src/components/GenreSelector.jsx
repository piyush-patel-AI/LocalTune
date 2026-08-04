import React, { useState } from 'react';

const CANONICAL_GENRES = [
  'Pop',
  'Rock',
  'Alternative Rock',
  'Hip-Hop',
  'Rap',
  'R&B',
  'EDM',
  'House',
  'Bollywood',
  'Anime',
  'Classical',
  'Jazz',
  'Metal',
  'Country',
  'Folk',
  'Lo-fi',
  'Synthwave'
];

export default function GenreSelector({ value = '', onChange, placeholder = 'Search or add custom genre...' }) {
  const [customInput, setCustomInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Convert comma-separated string to array
  const selectedGenres = (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const toggleGenre = (genreToToggle) => {
    const exists = selectedGenres.some((g) => g.toLowerCase() === genreToToggle.toLowerCase());
    let newSelected = [];
    if (exists) {
      newSelected = selectedGenres.filter((g) => g.toLowerCase() !== genreToToggle.toLowerCase());
    } else {
      newSelected = [...selectedGenres, genreToToggle];
    }
    onChange(newSelected.join(', '));
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed) {
      toggleGenre(trimmed);
      setCustomInput('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustom();
    }
  };

  // Filter canonical genres for dropdown search
  const filteredGenres = CANONICAL_GENRES.filter((g) =>
    g.toLowerCase().includes(customInput.toLowerCase())
  );

  return (
    <div className="genre-selector-wrapper" style={{ width: '100%' }}>
      {/* Search / Custom Genre Input with Add Button */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', position: 'relative' }}>
        <input
          type="text"
          className="form-input"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        {customInput.trim() && (
          <button
            type="button"
            className="btn-primary"
            onClick={handleAddCustom}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '600',
              whiteSpace: 'nowrap'
            }}
          >
            + Add
          </button>
        )}

        {/* Dropdown for search results */}
        {isOpen && customInput.trim() && filteredGenres.length > 0 && (
          <div
            className="genre-dropdown-menu"
            style={{
              position: 'absolute',
              top: '44px',
              left: 0,
              right: 0,
              background: 'var(--bg-glass, rgba(20, 20, 30, 0.95))',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              maxHeight: '160px',
              overflowY: 'auto',
              zIndex: 1000,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
            }}
          >
            {filteredGenres.map((g) => {
              const isSelected = selectedGenres.some((sel) => sel.toLowerCase() === g.toLowerCase());
              return (
                <div
                  key={g}
                  onMouseDown={() => toggleGenre(g)}
                  style={{
                    padding: '8px 12px',
                    color: isSelected ? '#818cf8' : '#fff',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent'
                  }}
                >
                  <span>{g}</span>
                  {isSelected && <span style={{ color: '#818cf8', fontWeight: 'bold' }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Genres Checkbox Chips Grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
        {CANONICAL_GENRES.map((g) => {
          const isSelected = selectedGenres.some((sel) => sel.toLowerCase() === g.toLowerCase());
          return (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '16px',
                border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                background: isSelected ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.04)',
                color: isSelected ? '#a5b4fc' : 'var(--text-secondary, #cbd5e1)',
                fontSize: '12px',
                fontWeight: isSelected ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.15s ease-in-out'
              }}
            >
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.3)',
                  background: isSelected ? '#6366f1' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#fff',
                  lineHeight: 1
                }}
              >
                {isSelected ? '✓' : ''}
              </span>
              <span>{g}</span>
            </button>
          );
        })}

        {/* Display custom non-canonical genres that were selected */}
        {selectedGenres
          .filter((g) => !CANONICAL_GENRES.some((cg) => cg.toLowerCase() === g.toLowerCase()))
          .map((customG) => (
            <button
              key={customG}
              type="button"
              onClick={() => toggleGenre(customG)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '16px',
                border: '1px solid #6366f1',
                background: 'rgba(99, 102, 241, 0.25)',
                color: '#a5b4fc',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  background: '#6366f1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#fff'
                }}
              >
                ✓
              </span>
              <span>{customG}</span>
            </button>
          ))}
      </div>
    </div>
  );
}
