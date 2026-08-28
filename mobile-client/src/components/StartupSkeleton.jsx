import logo from '../../../Assets/logo.png';

// Launch/startup skeleton that mirrors the real Octave Home layout while the
// app authenticates and initializes. Reuses the actual app shell + section
// classes (.mobile-app, .mobile-header, .section-container, .media-card,
// .artist-circle-item, .speed-dial-*, .quick-pick-row, .bottom-nav-bar, ...)
// so the transition into the real UI has no layout jump, and the existing
// .artwork-skeleton shimmer for every image placeholder.
function Sk({ width, height, radius = 6, style }) {
  return (
    <div
      className="sk-block"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export default function StartupSkeleton() {
  return (
    <div className="mobile-app">
      {/* Top Mobile Header */}
      <header className="mobile-header">
        <div className="header-brand">
          <img src={logo} alt="Octave" className="brand-logo-img" />
          <span className="brand-title">Octave</span>
        </div>

        <div className="header-actions">
          <div className="sk-block" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          <div className="sk-block" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        </div>
      </header>

      {/* Main Content (Home layout) */}
      <main className="mobile-content">
        <div className="mobile-home-view animate-fade-in">
          {/* Continue Listening / Hero */}
          <div className="hero-continue-card">
            <div className="hero-bg-glow" />
            <div className="hero-tag">
              <Sk width={130} height={10} />
            </div>
            <div className="hero-content-flex">
              <div className="hero-art-wrapper">
                <div className="artwork-skeleton" />
              </div>
              <div className="hero-info-text">
                <Sk width="62%" height={16} style={{ marginBottom: 8 }} />
                <Sk width="42%" height={12} />
              </div>
            </div>
          </div>

          {/* Made For You */}
          <section className="section-container">
            <div className="section-title-row">
              <Sk width={140} height={22} />
              <Sk width={70} height={12} />
            </div>
            <div className="horizontal-card-list">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="media-card" key={i}>
                  <div className="media-card-art-box">
                    <div className="artwork-skeleton" />
                  </div>
                  <Sk width="90%" height={12} style={{ marginTop: 6 }} />
                  <Sk width="60%" height={10} style={{ marginTop: 4 }} />
                </div>
              ))}
            </div>
          </section>

          {/* Favorite Artists */}
          <section className="section-container">
            <div className="section-title-row">
              <Sk width={160} height={22} />
              <Sk width={70} height={12} />
            </div>
            <div className="artist-circle-list">
              {Array.from({ length: 6 }).map((_, i) => (
                <div className="artist-circle-item" key={i}>
                  <div className="artist-avatar-ring sk-block" />
                  <Sk width={54} height={10} style={{ marginTop: 6 }} />
                </div>
              ))}
            </div>
          </section>

          {/* Speed Dial */}
          <section className="section-container">
            <div className="section-title-row">
              <Sk width={130} height={22} />
              <Sk width={90} height={12} />
            </div>
            <div className="speed-dial-carousel-container">
              <div className="speed-dial-page">
                <div className="speed-dial-asymmetric-grid">
                  <div className="speed-dial-tile large">
                    <div className="artwork-skeleton" />
                  </div>
                  <div className="speed-dial-tile">
                    <div className="artwork-skeleton" />
                  </div>
                  <div className="speed-dial-tile">
                    <div className="artwork-skeleton" />
                  </div>
                  <div className="speed-dial-tile">
                    <div className="artwork-skeleton" />
                  </div>
                  <div className="speed-dial-tile">
                    <div className="artwork-skeleton" />
                  </div>
                  <div className="speed-dial-tile">
                    <div className="artwork-skeleton" />
                  </div>
                </div>
              </div>
            </div>
            <div className="speed-dial-pagination">
              <span className="page-dot active" />
              <span className="page-dot" />
            </div>
          </section>

          {/* Quick Picks */}
          <section className="section-container" style={{ paddingBottom: '2rem' }}>
            <div className="section-title-row">
              <Sk width={130} height={22} />
              <Sk width={80} height={14} />
            </div>
            <div className="quick-picks-list">
              {Array.from({ length: 5 }).map((_, i) => (
                <div className="quick-pick-row" key={i}>
                  <div className="row-main-info">
                    <div className="row-art sk-block" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Sk width="70%" height={12} style={{ marginBottom: 6 }} />
                      <Sk width="45%" height={10} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav-bar">
        {['Home', 'Explore', 'Library', 'Settings'].map((t) => (
          <div className="nav-tab-item" key={t}>
            <div className="sk-block" style={{ width: 22, height: 22, borderRadius: 6 }} />
            <div className="sk-block" style={{ width: 40, height: 8, borderRadius: 4, marginTop: 6 }} />
          </div>
        ))}
      </nav>
    </div>
  );
}
