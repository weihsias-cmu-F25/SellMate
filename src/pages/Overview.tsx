import { useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Package,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  ItemPhoto,
  PageHeading,
  PlatformLogo,
} from "../components";
import {
  ageInDays,
  hasCleanup,
  itemName,
  money,
  needsReview,
  PLATFORMS,
  suggestedPrice,
} from "../model";
import { useStore } from "../store";

export function Overview() {
  const { state, createItem } = useStore(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const attention = params.has("attention");
  const reviews = state.items.filter((i) => needsReview(i, state.reminderDays));
  const cleanup = state.items.filter(hasCleanup);
  const visible = state.items.filter(
    (i) =>
      (filter === "all" || i.status === filter) &&
      itemName(i).toLowerCase().includes(query.toLowerCase()) &&
      (!attention || needsReview(i, state.reminderDays) || hasCleanup(i)),
  );
  const start = () => navigate(`/sell/${createItem()}`);
  return (
    <>
      <PageHeading
        eyebrow="YOUR SELLING DESK"
        title="A little less clutter."
        description="Your items, their next owners, and everything in between."
        action={
          <Button onClick={start}>
            <Plus size={17} />
            Sell an item
          </Button>
        }
      />
      <div className="overview-stats">
        <div className="overview-stat">
          <span className="stat-icon">
            <Package size={19} />
          </span>
          <div>
            <span>Active items</span>
            <strong>
              {state.items.filter((i) => i.status === "active").length}
              <small>finding their next home</small>
            </strong>
          </div>
        </div>
        <div className="overview-stat">
          <span className="stat-icon">
            <Clock3 size={19} />
          </span>
          <div>
            <span>In the works</span>
            <strong>
              {state.items.filter((i) => i.status === "draft").length}
              <small>drafts to come back to</small>
            </strong>
          </div>
        </div>
        <div className="overview-stat">
          <span className="stat-icon">
            <Check size={19} />
          </span>
          <div>
            <span>Sold so far</span>
            <strong>
              {money(
                state.items.reduce((total, i) => total + (i.salePrice || 0), 0),
              )}
              <small>
                from {state.items.filter((i) => i.status === "sold").length}{" "}
                happy handoffs
              </small>
            </strong>
          </div>
        </div>
      </div>
      {reviews[0] && (
        <section className="recommendation">
          <div className="recommendation-icon">
            <Sparkles size={22} />
          </div>
          <div className="recommendation-copy">
            <div className="eyebrow">A LITTLE NUDGE FROM SELLMATE</div>
            <h2>Let’s get your {reviews[0].model || "item"} moving.</h2>
            <p>
              It’s been {ageInDays(reviews[0].publishedAt)} days. A small
              adjustment from {money(reviews[0].price)} to{" "}
              <strong>{money(suggestedPrice(reviews[0].price))}</strong> could
              bring a little more interest.
            </p>
            <span className="small-text muted">
              Example suggestion · You decide when the price changes
            </span>
          </div>
          <Link
            className="button button-secondary"
            to={`/items/${reviews[0].id}`}
          >
            Review suggestion
            <ArrowRight size={16} />
          </Link>
        </section>
      )}
      {cleanup.length > 0 && (
        <Link to={`/items/${cleanup[0].id}`} className="cleanup-banner">
          <Check size={18} />
          <span>
            {itemName(cleanup[0])} is sold. Let’s close the remaining listings.
          </span>
          <ArrowRight size={18} />
        </Link>
      )}
      <section className="inventory">
        <div className="inventory-heading">
          <h2>
            Your items <span className="count-label">{state.items.length}</span>
          </h2>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search items"
              placeholder="Find an item…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="inventory-toolbar">
          <div className="filter-tabs" aria-label="Filter items">
            {[
              ["all", "All items"],
              ["active", "Active"],
              ["draft", "Drafts"],
              ["sold", "Sold"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
                <span>
                  {
                    state.items.filter((i) => key === "all" || i.status === key)
                      .length
                  }
                </span>
              </button>
            ))}
          </div>
          {attention && (
            <button className="text-button" onClick={() => setParams({})}>
              Clear attention filter ×
            </button>
          )}
        </div>
        {visible.length ? (
          <div className="item-grid">
            {visible.map((item) => (
              <Link
                key={item.id}
                to={
                  item.status === "draft"
                    ? `/sell/${item.id}`
                    : `/items/${item.id}`
                }
                className="item-card"
              >
                <div className="item-card-photo">
                  <ItemPhoto item={item} />
                  <div className="item-card-status">
                    <Badge
                      tone={
                        item.status === "draft"
                          ? "neutral"
                          : item.status === "sold"
                            ? "neutral"
                            : "green"
                      }
                    >
                      {item.status === "active" ? (
                        <>
                          <span className="live-dot" />
                          Live
                        </>
                      ) : item.status === "sold" ? (
                        <>
                          <Check size={12} />
                          Sold
                        </>
                      ) : (
                        "Draft"
                      )}
                    </Badge>
                  </div>
                  <span className="card-open">
                    <ArrowUpRight size={18} />
                  </span>
                </div>
                <div className="item-card-content">
                  <span className="eyebrow">{item.category}</span>
                  <div className="item-card-title">
                    <h3>{itemName(item)}</h3>
                    <span>
                      {item.price
                        ? money(
                            item.status === "sold"
                              ? item.salePrice || item.price
                              : item.price,
                          )
                        : "—"}
                    </span>
                  </div>
                  <p>
                    {item.status === "active"
                      ? `Listed ${ageInDays(item.publishedAt)} days ago`
                      : item.status === "sold"
                        ? "Off to its next chapter"
                        : `Step ${item.stage + 1} of 5 · Pick up where you left off`}
                  </p>
                  <div className="item-card-footer">
                    <div className="platform-stack">
                      {PLATFORMS.filter((p) =>
                        ["live", "needs-removal", "ended"].includes(
                          item.listings[p].status,
                        ),
                      ).map((p) => (
                        <PlatformLogo key={p} platform={p} />
                      ))}
                      {item.status === "draft" && (
                        <span className="small-text muted">
                          Not published yet
                        </span>
                      )}
                      {item.status === "sold" && !hasCleanup(item) && (
                        <span className="small-text muted">
                          <Check size={13} /> All done
                        </span>
                      )}
                    </div>
                    {needsReview(item, state.reminderDays) ? (
                      <span className="price-review-label">
                        <ArrowDownRight size={14} />
                        Price review
                      </span>
                    ) : hasCleanup(item) ? (
                      <span className="price-review-label">Close listings</span>
                    ) : (
                      <ArrowRight size={16} className="muted" />
                    )}
                  </div>
                </div>
              </Link>
            ))}
            <button className="new-item-card" onClick={start}>
              <span>
                <Plus size={24} />
              </span>
              <h3>What’s next?</h3>
              <p>Give something a new home.</p>
              <strong>
                Sell an item <ArrowRight size={15} />
              </strong>
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <Package size={35} />
            <h2>
              {query || attention || filter !== "all"
                ? "No items here just yet."
                : "Your next sale starts with a photo."}
            </h2>
            <p className="muted">
              {query
                ? "Try another name or clear your search."
                : "Pick something you no longer need. We’ll take it from there."}
            </p>
            <Button onClick={start}>
              <Plus size={17} />
              Sell an item
            </Button>
          </div>
        )}
      </section>
    </>
  );
}
