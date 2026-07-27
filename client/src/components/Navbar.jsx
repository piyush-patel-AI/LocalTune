import { useAuth } from '../context/AuthContext';
import {
  IconHome,
  IconMusic,
  IconDisc,
  IconUser,
  IconPlaylists,
  IconHeart,
  IconSearch,
  IconLogOut
} from './Icons';

export default function Navbar({ activeView, setActiveView }) {
  const { user, logout } = useAuth();

  const navItems = [
    { id: 'home', label: 'Home', icon: IconHome },
    { id: 'library', label: 'Library', icon: IconMusic },
    { id: 'albums', label: 'Albums & EPs', icon: IconDisc },
    { id: 'artists', label: 'Artists', icon: IconUser },
    { id: 'playlists', label: 'Playlists', icon: IconPlaylists },
    { id: 'favorites', label: 'Favorites', icon: IconHeart },
    { id: 'search', label: 'Search', icon: IconSearch }
  ];

  return (
    <nav className="sidebar">
      <div>
        <div className="brand-header">
          <img
            src="/api/logo"
            alt="LocalTune Logo"
            style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: 'var(--radius-md)' }}
          />
          <div className="brand-title">LocalTune</div>
        </div>

        <ul className="nav-list">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeView === item.id;
            return (
              <li
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <button onClick={() => setActiveView(item.id)}>
                  <IconComponent
                    size={18}
                    color={isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'}
                    fill={item.id === 'favorites' && isActive ? 'var(--accent-crimson)' : 'none'}
                  />
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sidebar-bottom">
        {user && (
          <div className="user-profile">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.68rem' }}>
              <div className="user-avatar">
                {user.displayName ? user.displayName[0].toUpperCase() : user.username[0].toUpperCase()}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                {user.displayName || user.username}
              </div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">
              <IconLogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
