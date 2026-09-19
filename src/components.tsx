import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  Headphones,
  LoaderCircle,
  Package,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  itemName,
  money,
  platformNames,
  type Item,
  type Platform,
} from "./model";

export function Button({
  children,
  variant = "primary",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`button button-${variant} ${className}`}
    >
      {loading && (
        <LoaderCircle className="spin" size={17} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "neutral" | "red";
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <ArrowUpRight size={small ? 16 : 23} strokeWidth={1.8} />
      </span>
      <span>
        sellmate<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export function PlatformLogo({ platform }: { platform: Platform }) {
  return (
    <span
      className={`platform-logo platform-${platform}`}
      aria-label={platformNames[platform]}
    >
      {platform === "vinted"
        ? "V"
        : platform === "facebook"
          ? "f"
          : platform === "offerup"
            ? "O"
            : "m"}
    </span>
  );
}
export function ItemPhoto({
  item,
  className = "",
}: {
  item: Item;
  className?: string;
}) {
  return (
    <div
      className={`item-photo photo-${item.category === "Cameras" ? "camera" : item.category === "Home & living" ? "home" : "audio"} ${className}`}
    >
      {item.photos[0] ? (
        <img
          src={item.photos[0]}
          alt={`${itemName(item)}${item.sample ? " illustration" : ""}`}
          className={item.sample ? "sample-photo" : "user-photo"}
        />
      ) : (
        <div className="photo-empty">
          <Package size={38} strokeWidth={1.2} />
          <span>Your item goes here</span>
        </div>
      )}
      {item.sample && <span className="photo-label">SAMPLE ITEM</span>}
    </div>
  );
}
export function ItemSummary({ item }: { item: Item }) {
  return (
    <aside className="item-summary">
      <div className="panel summary-panel">
        <div className="section-label">YOUR ITEM</div>
        <ItemPhoto item={item} />
        <div className="summary-copy">
          <Badge tone={item.status === "draft" ? "neutral" : "green"}>
            {item.status === "active"
              ? "Listed"
              : item.status === "sold"
                ? "Sold"
                : "Draft"}
          </Badge>
          <h3>{itemName(item)}</h3>
          <p className="muted small-text">{item.category}</p>
          <dl className="facts">
            <div>
              <dt>Condition</dt>
              <dd>{item.condition || "Not added yet"}</dd>
            </div>
            <div>
              <dt>Purchased</dt>
              <dd>{item.purchased || "Not sure"}</dd>
            </div>
            <div>
              <dt>Included</dt>
              <dd>{item.accessories || "Not specified"}</dd>
            </div>
            {item.price > 0 && (
              <div className="price-fact">
                <dt>Asking price</dt>
                <dd>{money(item.price)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <div className="sidebar-tip">
        <Sparkles size={18} />
        <p>
          A little help at every step.
          <br />
          <span className="muted">You’re always in control.</span>
        </p>
      </div>
    </aside>
  );
}
export function AgentLabel({
  text = "Your selling assistant",
}: {
  text?: string;
}) {
  return (
    <div className="agent-label">
      <span className="agent-icon">
        <Sparkles size={16} />
      </span>
      <strong>SellMate</strong>
      <span className="agent-divider" />
      <span>{text}</span>
    </div>
  );
}
export function ErrorMessage({ children }: { children?: ReactNode }) {
  return children ? (
    <div className="error-message" role="alert">
      {children}
    </div>
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2 id={id}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function NotFound() {
  return (
    <div className="empty-state">
      <Package size={40} />
      <h1>This item isn’t here.</h1>
      <p className="muted">
        It may have been cleared from your demo workspace.
      </p>
      <Link className="button button-primary" to="/">
        Back to overview
      </Link>
    </div>
  );
}
export function StepCheck({ done, index }: { done: boolean; index: number }) {
  return (
    <span className="step-number">
      {done ? <Check size={13} /> : index + 1}
    </span>
  );
}
export function DemoNote() {
  return (
    <p className="demo-note">
      <Headphones size={14} /> Demo data and simulated marketplace actions. No
      real listings are created.
    </p>
  );
}
