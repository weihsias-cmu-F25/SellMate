import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Link2,
  Pencil,
  Sparkles,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  ErrorMessage,
  ItemSummary,
  Modal,
  NotFound,
  PageHeading,
  PlatformLogo,
} from "../components";
import {
  ageInDays,
  changePrice,
  hasCleanup,
  itemName,
  log,
  markSold,
  money,
  needsReview,
  PLATFORMS,
  platformNames,
  platformUrls,
  suggestedPrice,
  validateListingUrl,
  type Platform,
} from "../model";
import { sellingService } from "../services";
import { useStore, useTask } from "../store";

export function ItemDetails() {
  const { id } = useParams();
  return <Details key={id} id={id || ""} />;
}
function Details({ id }: { id: string }) {
  const { state, updateItem, notify } = useStore(),
    item = state.items.find((i) => i.id === id);
  const [modal, setModal] = useState<"price" | "sold" | Platform | null>(null),
    [value, setValue] = useState(""),
    [url, setUrl] = useState(""),
    [soldOn, setSoldOn] = useState("eBay");
  const { busy, error, setError, run } = useTask();
  if (!item) return <NotFound />;
  const due = needsReview(item, state.reminderDays),
    cleanup = hasCleanup(item),
    needsConnection = item.listings.ebay.status === "live" && !state.connected;
  const dismiss = () => {
    setModal(null);
    setError("");
  };
  const open = (kind: typeof modal, price = item.price) => {
    setError("");
    setValue(String(price || ""));
    setModal(kind);
    if (kind && PLATFORMS.includes(kind as Platform))
      setUrl(item.listings[kind as Platform].url || "");
  };
  const snooze = () => {
    updateItem(id, (i) => ({ ...i, lastReviewAt: new Date().toISOString() }));
    notify(
      `Price kept. We’ll review it again after ${state.reminderDays || 7} days.`,
    );
  };
  const confirmPrice = (e: FormEvent) => {
    e.preventDefault();
    void run("Updating price…", async (signal) => {
      if (needsConnection)
        throw new Error(
          "Reconnect the eBay demo account before syncing its price.",
        );
      await sellingService.updatePrice(item, Number(value), signal);
      updateItem(id, (i) => changePrice(i, Number(value)));
      setModal(null);
      notify("Price updated. Check any manual marketplace updates below.");
    });
  };
  const confirmSold = (e: FormEvent) => {
    e.preventDefault();
    void run("Closing listings…", async (signal) => {
      if (needsConnection)
        throw new Error(
          "Reconnect the eBay demo account so we can close its listing.",
        );
      if (item.listings.ebay.status === "live")
        await sellingService.closeListing(item, signal);
      updateItem(id, (i) => markSold(i, Number(value), soldOn));
      setModal(null);
      notify("Sale recorded. Review the remaining marketplace cleanup.");
    });
  };
  const record = (e: FormEvent) => {
    e.preventDefault();
    const p = modal as Platform,
      valid = validateListingUrl(url, p);
    if (!valid) {
      setError(
        `Enter an HTTPS listing link from ${new URL(platformUrls[p]).hostname}.`,
      );
      return;
    }
    updateItem(id, (i) =>
      log(
        {
          ...i,
          price: i.price || Number(value),
          status: "active",
          publishedAt: i.publishedAt || new Date().toISOString(),
          listings: {
            ...i.listings,
            [p]: {
              ...i.listings[p],
              status: "live",
              url: valid,
              price: Number(value),
              publishedAt:
                i.listings[p].publishedAt || new Date().toISOString(),
            },
          },
        },
        `${platformNames[p]} listing recorded manually`,
      ),
    );
    setModal(null);
    notify("Listing link saved. It is now included in your tracking.");
  };
  const confirmRemoved = (p: Platform) => {
    updateItem(id, (i) =>
      log(
        {
          ...i,
          listings: {
            ...i.listings,
            [p]: { ...i.listings[p], status: "ended" },
          },
        },
        `${platformNames[p]} removal confirmed`,
      ),
    );
    notify("Removal confirmed.");
  };
  const confirmUpdated = (p: Platform) => {
    updateItem(id, (i) =>
      log(
        {
          ...i,
          listings: {
            ...i.listings,
            [p]: { ...i.listings[p], price: i.price },
          },
        },
        `${platformNames[p]} price update confirmed`,
      ),
    );
    notify("Marketplace price marked as up to date.");
  };
  const copy = (p: Platform) =>
    void run("Copying draft…", async () => {
      const l = item.listings[p];
      if (!l.title)
        throw new Error(
          "Create this marketplace draft in the selling flow first.",
        );
      await navigator.clipboard.writeText(
        `${l.title}\n\n${l.description}\n\nAsking price: ${money(item.price)}`,
      );
      notify(`${platformNames[p]} draft copied.`);
    });
  const tracked = PLATFORMS.filter(
    (p) =>
      item.listings[p].status !== "draft" &&
      item.listings[p].status !== "error",
  );
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={15} />
        All items
      </Link>
      <PageHeading
        eyebrow={
          item.status === "sold"
            ? "OFF TO ITS NEXT CHAPTER"
            : "YOUR ITEM WORKSPACE"
        }
        title={itemName(item)}
        description={
          item.status === "sold"
            ? `Sold for ${money(item.salePrice || 0)} · ${item.soldOn}`
            : `${money(item.price)} asking price · ${item.status === "active" ? `${ageInDays(item.publishedAt)} days listed` : "Not published yet"}`
        }
        action={
          item.status !== "sold" ? (
            <div className="button-row">
              <Button variant="secondary" onClick={() => open("price")}>
                <Pencil size={15} />
                Edit price
              </Button>
              <Button onClick={() => open("sold")}>
                <Check size={16} />
                Mark as sold
              </Button>
            </div>
          ) : (
            <Badge>
              <CheckCircle2 size={14} />
              Sold
            </Badge>
          )
        }
      />
      <ErrorMessage>{!modal && error}</ErrorMessage>
      <div className="workspace-grid">
        <div className="detail-main">
          {due && (
            <section className="price-nudge">
              <div className="recommendation-icon">
                <Sparkles size={21} />
              </div>
              <div>
                <div className="eyebrow">LET’S KEEP THINGS MOVING</div>
                <h2>Still looking for the right buyer?</h2>
                <p>
                  Try <strong>{money(suggestedPrice(item.price))}</strong>, down
                  from {money(item.price)}. A fresh price could help your item
                  stand out.
                </p>
                <p className="small-text muted">
                  Example suggestion after {ageInDays(item.publishedAt)} days.
                  Price changes need your approval.
                </p>
                <div className="button-row">
                  <Button
                    onClick={() => open("price", suggestedPrice(item.price))}
                  >
                    Review {money(suggestedPrice(item.price))}
                    <ArrowRight size={16} />
                  </Button>
                  <Button variant="ghost" onClick={snooze}>
                    Keep current price
                  </Button>
                </div>
              </div>
            </section>
          )}
          {item.status === "sold" && (
            <div className={`sale-celebration ${cleanup ? "pending" : ""}`}>
              <CheckCircle2 size={30} />
              <div>
                <h2>
                  {cleanup
                    ? "Sold! Just a little housekeeping."
                    : "A new home. A clean slate."}
                </h2>
                <p>
                  {cleanup
                    ? "Close the remaining listings below so no one else tries to buy it."
                    : "Every tracked listing is closed. Your sale is saved in your history."}
                </p>
              </div>
            </div>
          )}
          <section className="panel listings-panel">
            <div className="section-heading">
              <div>
                <h2>
                  {item.status === "sold"
                    ? "Listing cleanup"
                    : "Where it’s listed"}
                </h2>
                <p className="muted small-text">
                  {item.status === "sold"
                    ? "Each marketplace gets its own confirmation."
                    : "One item. Every marketplace, kept in view."}
                </p>
              </div>
              <span className="count-label">{tracked.length}</span>
            </div>
            {PLATFORMS.filter(
              (p) => item.status !== "sold" || tracked.includes(p),
            ).map((p) => {
              const l = item.listings[p],
                pendingPrice = l.status === "live" && l.price !== item.price;
              return (
                <div className="detail-listing" key={p}>
                  <div className="detail-listing-main">
                    <PlatformLogo platform={p} />
                    <div className="detail-listing-copy">
                      <h3>{platformNames[p]}</h3>
                      <p>
                        {l.status === "live"
                          ? `${money(l.price)} · ${l.url ? "Link recorded manually" : "Demo listing"}`
                          : l.status === "ended"
                            ? "Listing closed"
                            : l.status === "needs-removal"
                              ? "Remove the listing, then confirm below"
                              : l.status === "awaiting"
                                ? "Opened · awaiting a live listing link"
                                : "No live listing recorded"}
                      </p>
                    </div>
                    <Badge
                      tone={
                        l.status === "live" || l.status === "ended"
                          ? "green"
                          : l.status === "needs-removal" ||
                              l.status === "awaiting"
                            ? "amber"
                            : "neutral"
                      }
                    >
                      {l.status === "live"
                        ? "Live"
                        : l.status === "ended"
                          ? "Removed"
                          : l.status === "needs-removal"
                            ? "Needs action"
                            : l.status === "awaiting"
                              ? "Unconfirmed"
                              : "Draft"}
                    </Badge>
                  </div>
                  <div className="detail-listing-actions">
                    {l.url && (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-button"
                      >
                        View listing
                        <ExternalLink size={13} />
                      </a>
                    )}
                    {l.status === "needs-removal" && (
                      <>
                        {!l.url && (
                          <a
                            href={platformUrls[p]}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-button"
                          >
                            Open marketplace
                            <ExternalLink size={13} />
                          </a>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => confirmRemoved(p)}
                        >
                          <Check size={14} />
                          I’ve removed it
                        </Button>
                      </>
                    )}
                    {item.status !== "sold" &&
                      (p !== "ebay" || l.status !== "live") && (
                        <Button
                          variant="ghost"
                          onClick={() => open(p, l.price || item.price)}
                        >
                          <Link2 size={14} />
                          {l.url ? "Edit listing link" : "Record live listing"}
                        </Button>
                      )}
                    {item.status !== "sold" &&
                      !!l.title &&
                      l.status !== "live" && (
                        <Button
                          variant="ghost"
                          disabled={!!busy}
                          onClick={() => copy(p)}
                        >
                          <Copy size={14} />
                          Copy draft
                        </Button>
                      )}
                  </div>
                  {pendingPrice && (
                    <div className="pending-price">
                      <span>
                        Price update needed: {money(l.price)} →{" "}
                        {money(item.price)}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => confirmUpdated(p)}
                      >
                        I’ve updated it
                        <Check size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {item.status !== "sold" && (
              <Link className="text-button add-marketplace" to={`/sell/${id}`}>
                Continue selling setup
                <ArrowRight size={15} />
              </Link>
            )}
          </section>
          <section className="panel activity-panel">
            <h2>The story so far</h2>
            {item.activity.length ? (
              <ol className="activity-list">
                {item.activity.map((a, n) => (
                  <li key={a.id}>
                    <span
                      className={
                        n === 0 ? "activity-dot latest" : "activity-dot"
                      }
                    />
                    <div>
                      <p>{a.text}</p>
                      <time dateTime={a.at}>
                        {new Date(a.at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="inline-note subtle">
                <Clock3 size={17} />
                <span>Your item’s activity will appear here as you go.</span>
              </div>
            )}
          </section>
        </div>
        <ItemSummary item={item} />
      </div>
      {modal && (
        <Modal
          title={
            modal === "sold"
              ? "Found its next owner?"
              : modal === "price"
                ? "A fresh asking price"
                : `Track your ${platformNames[modal]} listing`
          }
          onClose={dismiss}
          busy={!!busy}
        >
          <ErrorMessage>{error}</ErrorMessage>
          {modal === "sold" ? (
            <form onSubmit={confirmSold}>
              <p className="muted">
                Record the sale. I’ll close the demo eBay listing and help you
                finish the rest.
              </p>
              <label>
                Where did it sell?
                <select
                  value={soldOn}
                  onChange={(e) => setSoldOn(e.target.value)}
                >
                  {[
                    ...PLATFORMS.map((p) => platformNames[p]),
                    "Local sale",
                    "Other",
                  ].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Final sale price · USD
                <input
                  required
                  type="number"
                  min="0.01"
                  max="99999"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <div className="inline-note">
                <CheckCircle2 size={18} />
                <span>
                  {item.listings.ebay.status === "live"
                    ? "eBay will be closed in this demo. "
                    : ""}
                  Any other live or unconfirmed listings will stay on your
                  cleanup checklist until you confirm removal.
                </span>
              </div>
              {needsConnection && (
                <p className="error-message">
                  Reconnect your demo eBay account in Connections first.
                </p>
              )}
              <div className="modal-actions">
                <Button variant="secondary" onClick={dismiss} disabled={!!busy}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={!!busy}
                  disabled={needsConnection}
                >
                  {busy || "Confirm sold & close listings"}
                </Button>
              </div>
            </form>
          ) : modal === "price" ? (
            <form onSubmit={confirmPrice}>
              <p className="muted">
                Currently {money(item.price)}. You choose what feels right.
              </p>
              <label>
                New asking price · USD
                <input
                  required
                  autoFocus
                  type="number"
                  min="1"
                  max="99999"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <div className="inline-note">
                <Sparkles size={18} />
                <span>
                  {item.listings.ebay.status === "live"
                    ? "The eBay price will update in this demo. "
                    : ""}
                  Other live marketplaces will show a reminder to update their
                  prices manually.
                </span>
              </div>
              {needsConnection && (
                <p className="error-message">
                  Reconnect your demo eBay account in Connections first.
                </p>
              )}
              <div className="modal-actions">
                <Button variant="secondary" disabled={!!busy} onClick={dismiss}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={!!busy}
                  disabled={needsConnection}
                >
                  {busy || "Approve price change"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={record}>
              <p className="muted">
                Already published? Save its live link so you can find it and
                remove it when your item sells.
              </p>
              <label>
                Live listing URL
                <input
                  required
                  autoFocus
                  type="url"
                  placeholder={`${platformUrls[modal]}…`}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Price on this marketplace · USD
                <input
                  required
                  type="number"
                  min="1"
                  max="99999"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <p className="small-text muted">
                Saved as your confirmation. SellMate doesn’t verify that the
                external listing is live.
              </p>
              <div className="modal-actions">
                <Button variant="secondary" onClick={dismiss}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save listing
                  <Link2 size={15} />
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
