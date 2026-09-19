import { useEffect } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  CircleHelp,
  FlaskConical,
  LayoutGrid,
  Link2,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Brand, NotFound } from "./components";
import { needsReview } from "./model";
import { StoreProvider, useStore } from "./store";
import { Overview } from "./pages/Overview";
import { Sell } from "./pages/Sell";
import { ItemDetails } from "./pages/ItemDetails";
import { Connections } from "./pages/Connections";

function Shell() {
  const { state, createItem, storageError, notice } = useStore(),
    navigate = useNavigate(),
    location = useLocation();
  const reviewCount = state.items.filter((i) =>
    needsReview(i, state.reminderDays),
  ).length;
  const title = location.pathname.startsWith("/sell")
    ? "Selling workspace"
    : location.pathname.startsWith("/items")
      ? "Item workspace"
      : location.pathname.startsWith("/connections")
        ? "Marketplace connections"
        : "Your overview";
  useEffect(() => {
    document.title = `${title} · SellMate`;
    window.scrollTo(0, 0);
  }, [location.pathname, title]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="SellMate overview">
          <Brand />
        </Link>
        <div className="workspace-label">
          <span className="workspace-avatar">S</span>
          <div>
            Personal workspace<span>Make room for what’s next</span>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <LayoutGrid size={18} />
            Overview
          </NavLink>
          <button
            className={location.pathname.startsWith("/sell") ? "active" : ""}
            onClick={() => navigate(`/sell/${createItem()}`)}
          >
            <Plus size={19} />
            Sell an item<kbd>+</kbd>
          </button>
          <NavLink to="/connections">
            <Link2 size={18} />
            Connections
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="side-note">
            <span className="side-note-icon">
              <Sparkles size={19} />
            </span>
            <p>
              Less listing.
              <br />
              More living.
            </p>
            <span>
              Your next sale starts
              <br />
              with a single photo.
            </span>
            <button
              onClick={() => navigate(`/sell/${createItem()}`)}
              aria-label="Start selling an item"
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <Link to="/connections#demo" className="sidebar-help">
            <CircleHelp size={17} />
            About this demo
          </Link>
          <div className="sidebar-foot">
            A little less clutter. A little more possibility.
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>{title}</strong>
          </span>
          <div className="topbar-actions">
            <Link className="demo-indicator" to="/connections#demo">
              <span />
              Demo mode
            </Link>
            <Link
              to="/?attention=1"
              className="notification-button"
              aria-label={`${reviewCount} price review suggestions`}
            >
              <Bell size={18} />
              {reviewCount > 0 && <span className="notification-dot" />}
            </Link>
            <span className="profile-avatar" aria-label="Demo profile">
              S
            </span>
          </div>
        </header>
        <div className="demo-banner">
          <FlaskConical size={14} />
          <span>
            A place to try things out. Example data, no real marketplace
            actions.
          </span>
          <Link to="/connections#demo">
            Demo settings <ArrowUpRight size={13} />
          </Link>
        </div>
        {storageError && (
          <div className="storage-warning" role="alert">
            Browser storage is full or unavailable. Your changes are available
            for this session, but may be lost when you leave. Try fewer photos
            or enable browser storage.
          </div>
        )}
        <main id="main-content" className="main-content">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/sell/:id" element={<Sell />} />
            <Route path="/items/:id" element={<ItemDetails />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>Made for the things ready for their next chapter.</span>
          <span>sellmate © {new Date().getFullYear()}</span>
        </footer>
      </div>
      <div
        className={`toast ${notice ? "toast-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice && (
          <>
            <Check size={17} />
            <span>{notice}</span>
          </>
        )}
      </div>
    </div>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </BrowserRouter>
  );
}
