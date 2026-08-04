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

  const filteredGenres = CANONICAL_GENRES.filter((g) =>
    g.toLowerCase().includes(customInput.toLowerCase())
  );

  return (
    <div className="mobile-genre-selector" style={{ width: '100%' }}>
      {/* Search / Custom Genre Input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', position: 'relative' }}>
        <input
          type="text"
          className="mobile-input"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            fontSize: '14px',
            outline: 'none'
          }}
        />
        {customInput.trim() && (
          <button
            type="button"
            onClick={handleAddCustom}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              background: '#6366f1',
              border: 'none',
              color: '#fff',
              fontWeight: '600',
              fontSize: '12px',
              whiteSpace: 'nowrap'
            }}
          >
            + Add
          </button>
        )}

        {isOpen && customInput.trim() && filteredGenres.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: '44px',
              left: 0,
              right: 0,
              background: 'rgba(25, 25, 35, 0.98)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '10px',
              maxHeight: '160px',
              overflowY: 'auto',
              zIndex: 1000
            }}
          >
            {filteredGenres.map((g) => {
              const isSelected = selectedGenres.some((sel) => sel.toLowerCase() === g.toLowerCase());
              return (
                <div
                  key={g}
                  onMouseDown={() => toggleGenre(g)}
                  style={{
                    padding: '10px 14px',
                    color: isSelected ? '#a5b4fc' : '#fff',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent'
                  }}
                >
                  <span>{g}</span>
                  {isSelected && <span style={{ color: '#a5b4fc', fontWeight: 'bold' }}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Multi-Select Checkbox Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
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
                padding: '6px 12px',
                borderRadius: '16px',
                border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.15)',
                background: isSelected ? '#6366f1' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: isSelected ? '600' : '400',
                cursor: 'pointer'
              }}
            >
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  border: isSelected ? '1px solid #fff' : '1px solid rgba(255,255,255,0.4)',
                  background: isSelected ? '#fff' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#6366f1',
                  lineHeight: 1,
                  fontWeight: 'bold'
                }}
              >
                {isSelected ? '✓' : ''}
              </span>
              <span>{g}</span>
            </button>
          );
        })}

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
                padding: '6px 12px',
                borderRadius: '16px',
                border: '1px solid #6366f1',
                background: '#6366f1',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  background: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  color: '#6366f1',
                  fontWeight: 'bold'
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
