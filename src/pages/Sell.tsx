import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  ImagePlus,
  Link2,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AgentLabel,
  Badge,
  Button,
  DemoNote,
  ErrorMessage,
  ItemSummary,
  NotFound,
  PageHeading,
  PlatformLogo,
  StepCheck,
} from "../components";
import {
  generateListings,
  itemName,
  log,
  money,
  INTEGRATED_PLATFORMS,
  platformNames,
  revise,
  type Item,
  type Platform,
} from "../model";
import { readPhoto, sellingService } from "../services";
import { useStore, useTask } from "../store";

import { DetailsChat } from "../DetailsChat";
import { canPublish, publishBatch, selectedPlatforms } from "../publishing";

const steps = ["Photo", "Details", "Price", "Review", "Publish"];
export function Sell() {
  const { id } = useParams();
  return <SellWorkspace key={id} id={id || ""} />;
}
function SellWorkspace({ id }: { id: string }) {
  const { state, updateItem, notify, storageError } = useStore(),
    navigate = useNavigate();
  const item = state.items.find((i) => i.id === id);
  const [step, setStep] = useState(item?.stage || 0),
    [previewPlatform, setPlatform] = useState<Platform>("ebay");
  const [showComparables, setShowComparables] = useState(false),
    [dragging, setDragging] = useState(false);
  const [publishingTargets, setPublishingTargets] = useState<Platform[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null);
  const { busy, error, setError, run } = useTask();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  if (!item) return <NotFound />;
  if (item.status === "sold")
    return (
      <div className="empty-state">
        <CheckCircle2 size={42} />
        <h1>This item has a new home.</h1>
        <p className="muted">
          You can review the sale and remaining cleanup in its workspace.
        </p>
        <Link to={`/items/${id}`} className="button button-primary">
          View sold item
          <ArrowRight size={17} />
        </Link>
      </div>
    );
  const patch = (values: Partial<Item>) =>
    updateItem(id, (i) => revise(i, values));
  const advance = (next: number) => {
    updateItem(id, (i) => ({ ...i, stage: Math.max(i.stage, next) }));
    setStep(next);
    setError("");
  };
  const addPhotos = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (!incoming.length) return;
    if (incoming.length + item.photos.length > 4) {
      setError("You can add up to 4 photos. Remove one before adding more.");
      return;
    }
      void run("Identifying your item…", async (signal) => {
      const photos = await Promise.all(incoming.map(readPhoto));
      if (signal.aborted) return;
      const shouldIdentify = item.photos.length === 0 && !item.brand.trim();
      updateItem(id, (i) => ({
        ...i,
        sample: false,
        photos: [...i.photos, ...photos],
        reviewed: false,
      }));
      if (!shouldIdentify) return;
      const identified = await sellingService.identifyPhoto(photos[0], signal);
      if (signal.aborted) return;
      const prefill = identified.prefill || {};
      // Only lock in identity from vision; leave condition/details for the 3–5 questions.
      updateItem(id, (i) =>
        log(
          {
            ...i,
            brand: prefill.brand || identified.brand,
            model: prefill.model || identified.model,
            category: prefill.category || identified.category,
            questionPlan: identified.questionPlan,
            identificationNotes:
              identified.summary ||
              identified.notes ||
              (identified.confidence != null
                ? `${Math.round(identified.confidence * 100)}% confidence`
                : i.identificationNotes),
            stage: Math.max(1, i.stage),
            reviewed: false,
          },
          identified.aiEnabled
            ? `Identified ${identified.name || identified.brand} with AI`
            : `Identified ${identified.name || [identified.brand, identified.model].join(" ")}`,
        ),
      );
      setStep(1);
    });
  };
  const useSample = () =>
    void run("Taking a closer look…", async (signal) => {
      const result = await sellingService.identifySample(signal);
      updateItem(id, (i) =>
        log(
          {
            ...i,
            brand: result.brand,
            model: result.model,
            category: result.category,
            questionPlan: result.questionPlan,
            photos: ["/headphones.svg"],
            sample: true,
            stage: Math.max(1, i.stage),
            reviewed: false,
          },
          "Sample item identified",
        ),
      );
      setStep(1);
    });
  const research = () =>
    void run("Comparing similar items…", async (signal) => {
      const result = await sellingService.research(item, signal);
      updateItem(id, (i) =>
        log(
          {
            ...i,
            research: result,
            price: result.recommended,
            reviewed: false,
            stage: Math.max(2, i.stage),
          },
          result.reason
            ? `Price research ready · ${result.source || "estimate"}`
            : "Price research prepared",
        ),
      );
      setStep(2);
    });
  const generate = () => {
    void run("Writing marketplace drafts…", async (signal) => {
      const draft = await sellingService.generateListingDraft(item, signal);
      if (signal.aborted) return;
      updateItem(id, (i) =>
        log(
          {
            ...generateListings(i, {
              title: draft.title,
              description: draft.description,
              byPlatform: draft.byPlatform,
            }),
            stage: Math.max(3, i.stage),
          },
          "Marketplace drafts generated",
        ),
      );
      setStep(3);
    });
  };
  const connectedPlatforms = INTEGRATED_PLATFORMS.filter(
    (p) => state.connections[p],
  );
  const targets = selectedPlatforms(item, state.connections).filter(
    (p) => step !== 3 || state.connections[p],
  );
  const previewPlatforms = connectedPlatforms.filter((p) =>
    targets.includes(p),
  );
  const platform = previewPlatforms.includes(previewPlatform)
    ? previewPlatform
    : (previewPlatforms[0] ?? "ebay");
  const pendingTargets = targets.filter(
    (p) => item.listings[p].status !== "live",
  );
  const liveTargets = targets.filter((p) => item.listings[p].status === "live");
  const failedTargets = targets.filter(
    (p) => item.listings[p].status === "error",
  );
  const toggleTarget = (p: Platform, selected: boolean) => {
    const next = selected
      ? [...new Set([...targets, p])]
      : targets.filter((t) => t !== p);
    patch({ publishTargets: next, reviewed: false });
    if (selected) setPlatform(p);
  };
  const publish = () => {
    if (!canPublish(item, targets, state.connections)) return;
    setStep(4);
    updateItem(id, (i) => ({ ...i, stage: 4, publishTargets: targets }));
    void run("Publishing selected marketplaces…", async (signal) => {
      setPublishingTargets(pendingTargets);
      try {
        const results = await publishBatch(
          item,
          targets,
          state.connections,
          sellingService,
          (result) => {
            const p = result.platform;
            updateItem(id, (i) =>
              result.ok
                ? log(
                    {
                      ...i,
                      status: "active",
                      publishedAt: i.publishedAt || result.publishedAt,
                      listings: {
                        ...i.listings,
                        [p]: {
                          ...i.listings[p],
                          status: "live",
                          managed: true,
                          price: i.price,
                          error: undefined,
                          publishedAt: result.publishedAt,
                        },
                      },
                    },
                    `Published to ${platformNames[p]} · demo`,
                  )
                : {
                    ...i,
                    listings: {
                      ...i.listings,
                      [p]: {
                        ...i.listings[p],
                        status: "error",
                        error: result.error,
                      },
                    },
                  },
            );
            setPublishingTargets((current) => current.filter((t) => t !== p));
          },
          signal,
        );
        const succeeded = results.filter((r) => r.ok).length;
        notify(
          succeeded === results.length
            ? `Published to ${succeeded} marketplace${succeeded === 1 ? "" : "s"} in demo mode.`
            : `${succeeded} published. Review the remaining marketplace errors below.`,
        );
      } finally {
        if (!signal.aborted) setPublishingTargets([]);
      }
    });
  };
  const currentListing = item.listings[platform];
  const ready = canPublish(item, targets, state.connections);
  const detailReady =
    !!item.brand.trim() &&
    !!item.model.trim() &&
    !!item.condition &&
    !!item.functional;
  const footer = (hint: string, next: React.ReactNode) => (
    <div className="step-footer">
      <span className="small-text muted">{hint}</span>
      {next}
    </div>
  );
  return (
    <div className={`sell-workspace ${step === 1 ? "details-mode" : ""}`}>
      <PageHeading
        eyebrow="FROM SHELF TO SOLD"
        title="Let’s find it a new home."
        description="A few details from you. A little legwork from SellMate."
        action={
          <span className="saved-indicator">
            <Check size={14} />
            {storageError
              ? "Session only · storage unavailable"
              : "Draft saved locally"}
          </span>
        }
      />
      <nav className="stepper" aria-label="Selling progress">
        {steps.map((label, index) => (
          <button
            key={label}
            disabled={index > item.stage || !!busy}
            aria-current={index === step ? "step" : undefined}
            className={`${index === step ? "current" : ""} ${index < step ? "complete" : ""}`}
            onClick={() => {
              setStep(index);
              setError("");
            }}
          >
            <StepCheck done={index < step} index={index} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="workspace-grid">
        <section className="panel agent-panel">
          <AgentLabel />
          <ErrorMessage>{error}</ErrorMessage>
          <fieldset className="task-fields" disabled={!!busy}>
            {step === 0 && (
              <div className="step-content">
                <div className="step-intro">
                  <h2>What are we selling?</h2>
                  <p>Start with a clear photo. We’ll take it from there.</p>
                </div>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="visually-hidden"
                  aria-label="Upload item photos"
                  onChange={(e) => {
                    if (e.target.files) addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="visually-hidden"
                  aria-label="Take an item photo"
                  onChange={(e) => {
                    if (e.target.files) addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
                {!item.photos.length ? (
                  <div
                    className={`upload-zone ${dragging ? "dragging" : ""}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      if (!busy) addPhotos(e.dataTransfer.files);
                    }}
                  >
                    <div className="upload-icon">
                      <Camera size={32} strokeWidth={1.3} />
                      <span>
                        <PlusIcon />
                      </span>
                    </div>
                    <h3>A new chapter starts with a photo.</h3>
                    <p>Drop your photos here, or pick one from your device.</p>
                    <div className="button-row">
                      <Button
                        variant="secondary"
                        onClick={() => uploadRef.current?.click()}
                      >
                        <Upload size={16} />
                        Upload photos
                      </Button>
                      <Button
                        variant="secondary"
                        className="camera-button"
                        onClick={() => cameraRef.current?.click()}
                      >
                        <Camera size={16} />
                        Take a photo
                      </Button>
                    </div>
                    <span className="small-text muted">
                      JPG, PNG, or WebP · Up to 8 MB each · 4 photos max
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="upload-previews">
                      {item.photos.map((photo, n) => (
                        <div key={photo.slice(-40) + n}>
                          <img src={photo} alt={`Item photo ${n + 1}`} />
                          <button
                            type="button"
                            className="remove-photo"
                            aria-label={`Remove photo ${n + 1}`}
                            onClick={() =>
                              patch({
                                photos: item.photos.filter(
                                  (_, index) => index !== n,
                                ),
                                reviewed: false,
                              })
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                      {item.photos.length < 4 && (
                        <button
                          className="add-photo"
                          onClick={() => uploadRef.current?.click()}
                        >
                          <ImagePlus size={24} />
                          <span>Add photo</span>
                        </button>
                      )}
                    </div>
                    <div className="inline-note">
                      <ShieldCheck size={17} />
                      <span>
                        Your photos stay in this browser. In this demo, you’ll
                        confirm the product yourself.
                      </span>
                    </div>
                  </>
                )}
                {!item.photos.length && (
                  <button className="sample-choice" onClick={useSample}>
                    <span className="sample-thumb">
                      <img src="/headphones.svg" alt="" />
                    </span>
                    <span>
                      <strong>Just exploring? Try the headphones demo.</strong>
                      <small>See how it works with a Sony WH-1000XM5.</small>
                    </span>
                    <ArrowRight size={17} />
                  </button>
                )}
                {footer(
                  "Tip: include the front, back, and any wear.",
                  <Button
                    disabled={!item.photos.length}
                    onClick={() => advance(1)}
                  >
                    Continue
                    <ArrowRight size={16} />
                  </Button>,
                )}
              </div>
            )}
            {step === 1 && <DetailsChat item={item} onContinue={research} />}
            {step === 2 && (
              <div className="step-content">
                <div className="step-intro">
                  <h2>
                    A good price.
                    <br />
                    Backed by a little homework.
                  </h2>
                  <p>
                    {item.research ? (
                      <>
                        Here’s a price comparison for your {itemName(item)}.
                        Start at{" "}
                        <strong>{money(item.research.recommended)}</strong> for
                        a balanced asking price.
                      </>
                    ) : (
                      "Let’s compare similar items to find your starting price."
                    )}
                  </p>
                </div>
                {item.research ? (
                  <>
                    <div className="research-status">
                      <span>
                        <CheckCircle2 size={15} />
                        {item.research.comparables.length} comparables
                        {item.research.source === "live"
                          ? " · live web listings"
                          : item.research.source === "ai_estimate"
                            ? " · AI market estimate"
                            : item.research.source === "curated"
                              ? " · matched comps"
                              : ""}
                      </span>
                      <span>USD</span>
                    </div>
                    {item.research.reason && (
                      <p className="muted" style={{ marginTop: 8 }}>
                        {item.research.reason}
                      </p>
                    )}
                    <div className="price-options">
                      {[
                        [
                          item.research.fast,
                          "Fast sale",
                          "A little less waiting",
                          Zap,
                        ],
                        [
                          item.research.recommended,
                          "Recommended",
                          "The balanced choice",
                          Sparkles,
                        ],
                        [
                          item.research.max,
                          "Max value",
                          "Room to be patient",
                          ArrowUpRightIcon,
                        ],
                      ].map(([value, title, subtitle, Icon]) => {
                        const Glyph = Icon as typeof Sparkles;
                        return (
                          <button
                            type="button"
                            key={title as string}
                            className={`price-option ${item.price === value ? "selected" : ""}`}
                            aria-pressed={item.price === value}
                            onClick={() => patch({ price: value as number })}
                          >
                            <span className="price-option-label">
                              <Glyph size={15} />
                              {title as string}
                            </span>
                            <strong>{money(value as number)}</strong>
                            <span>{subtitle as string}</span>
                            {item.price === value && (
                              <CheckCircle2
                                className="selected-check"
                                size={16}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <label className="custom-price-label">
                      Your asking price
                      <div className="price-input">
                        <span>$</span>
                        <input
                          aria-label="Your asking price"
                          type="number"
                          min="1"
                          max="99999"
                          step="0.01"
                          value={item.price || ""}
                          onChange={(e) =>
                            patch({
                              price: Math.max(
                                0,
                                Math.min(99999, Number(e.target.value)),
                              ),
                            })
                          }
                        />
                        <span>USD</span>
                      </div>
                    </label>
                    <p className="small-text muted">
                      Marketplace fees and shipping are not included. Sale speed
                      isn’t guaranteed.
                    </p>
                    <div className="comparables">
                      <button
                        className="comparables-toggle"
                        aria-expanded={showComparables}
                        onClick={() => setShowComparables(!showComparables)}
                      >
                        <span>
                          <Search size={16} />
                          Why this price? See the comparison
                        </span>
                        <ChevronDown
                          size={17}
                          className={showComparables ? "rotate" : ""}
                        />
                      </button>
                      {showComparables && (
                        <div className="comparables-content">
                          <p className="small-text muted">
                            {item.research.source === "live"
                              ? "Live listings scraped from Craigslist and search results (OfferUp / eBay / Mercari / Marketplace) with links."
                              : item.research.source === "ai_estimate"
                                ? "AI market estimate for this brand/model (live scrape returned too few priced results)."
                                : item.research.source === "curated"
                                  ? "Matched comps from our local dataset for this product."
                                  : "Limited matching comps were available."}
                          </p>
                          {item.research.comparables.map((c) => (
                            <div className="comparable" key={c.id}>
                              <div>
                                <strong>
                                  {c.url ? (
                                    <a
                                      href={c.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      {c.title}
                                    </a>
                                  ) : (
                                    c.title
                                  )}
                                </strong>
                                <span>
                                  {c.platform} · {c.condition}
                                  {c.source ? ` · ${c.source}` : ""}
                                  {c.type ? ` · ${c.type}` : ""}
                                </span>
                              </div>
                              <strong>
                                {c.price > 0 ? money(c.price) : "See listing"}
                              </strong>
                            </div>
                          ))}
                          <p className="small-text muted">
                            Prepared{" "}
                            {new Date(
                              item.research.checkedAt,
                            ).toLocaleDateString()}
                            . Open a title to view the original listing.
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="inline-note">
                    <CircleHelp size={18} />
                    <span>
                      {detailReady
                        ? "The item details changed. Refresh the comparison before continuing."
                        : "Add the brand, model, condition, and functionality first."}
                    </span>
                    <Button
                      variant="secondary"
                      onClick={detailReady ? research : () => setStep(1)}
                    >
                      {detailReady ? "Compare prices" : "Add details"}
                    </Button>
                  </div>
                )}
                {footer(
                  "Your item. Your price.",
                  <Button
                    disabled={!item.research || item.price <= 0}
                    onClick={generate}
                  >
                    Create my listings
                    <ArrowRight size={16} />
                  </Button>,
                )}
              </div>
            )}
            {step === 3 && (
              <div className="step-content">
                <div className="step-intro">
                  <h2>
                    Your item, ready for
                    <br />
                    its next owner.
                  </h2>
                  <p>
                    Choose all the marketplaces you want, review your drafts,
                    and publish them together.
                  </p>
                </div>
                <fieldset className="publish-selection">
                  <legend>
                    Where should I publish?{" "}
                    <span>{targets.length} selected</span>
                  </legend>
                  <div className="publish-choice-grid">
                    {connectedPlatforms.map((p) => (
                      <label
                        key={p}
                        className={`publish-choice ${targets.includes(p) ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Publish on ${platformNames[p]}`}
                          checked={targets.includes(p)}
                          disabled={item.listings[p].status === "live"}
                          onChange={(e) => toggleTarget(p, e.target.checked)}
                        />
                        <PlatformLogo platform={p} />
                        <span>
                          <strong>{platformNames[p]}</strong>
                          <small>
                            {item.listings[p].status === "live"
                              ? "Already live · won’t repost"
                              : "Connected · ready to publish"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!connectedPlatforms.length && (
                    <p>
                      Connect a marketplace to review and publish your listing.
                    </p>
                  )}
                  <Link to="/connections" className="text-button">
                    Manage connections
                    <Link2 size={14} />
                  </Link>
                </fieldset>
                {connectedPlatforms.length > 0 && !previewPlatforms.length && (
                  <p>
                    Select a marketplace above to preview and edit its draft.
                  </p>
                )}
                {previewPlatforms.length > 0 && (
                  <>
                    <p className="draft-preview-label">
                      Preview & edit each draft{" "}
                      <span>
                        Switching previews doesn’t change your selection.
                      </span>
                    </p>
                    <div
                      className="platform-tabs"
                      aria-label="Draft preview only"
                    >
                      {previewPlatforms.map((p) => (
                        <button
                          type="button"
                          key={p}
                          aria-pressed={platform === p}
                          onClick={() => setPlatform(p)}
                        >
                          <PlatformLogo platform={p} />
                          <span>
                            {p === "facebook" ? "Facebook" : platformNames[p]}
                          </span>
                        </button>
                      ))}
                    </div>
                    {(!currentListing.title ||
                      currentListing.price !== item.price) &&
                    currentListing.status !== "live" ? (
                      <div className="inline-note">
                        <Sparkles size={18} />
                        <span>
                          Your details changed. Refresh your drafts to bring
                          them up to date.
                        </span>
                        <Button onClick={generate}>Refresh drafts</Button>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (ready) publish();
                        }}
                      >
                        <label>
                          Listing title
                          <span className="optional">
                            {currentListing.title.length}/
                            {platform === "ebay" ? 80 : 120}
                          </span>
                          <input
                            required
                            maxLength={platform === "ebay" ? 80 : 120}
                            value={currentListing.title}
                            readOnly={currentListing.status === "live"}
                            onChange={(e) =>
                              updateItem(id, (i) => ({
                                ...i,
                                reviewed: false,
                                listings: {
                                  ...i.listings,
                                  [platform]: {
                                    ...i.listings[platform],
                                    title: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            required
                            rows={5}
                            value={currentListing.description}
                            readOnly={currentListing.status === "live"}
                            onChange={(e) =>
                              updateItem(id, (i) => ({
                                ...i,
                                reviewed: false,
                                listings: {
                                  ...i.listings,
                                  [platform]: {
                                    ...i.listings[platform],
                                    description: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <div className="review-price">
                          <span>Asking price</span>
                          <strong>{money(item.price)}</strong>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setStep(2)}
                          >
                            Edit
                          </button>
                        </div>
                        <div className="field-grid">
                          <label>
                            Delivery
                            <select
                              value={item.delivery}
                              onChange={(e) =>
                                patch({
                                  delivery: e.target.value,
                                  reviewed: false,
                                })
                              }
                            >
                              <option>Local pickup</option>
                              <option>Buyer-paid shipping</option>
                              <option>Free shipping</option>
                            </select>
                          </label>
                          <label>
                            Item location
                            <input
                              required
                              value={item.location}
                              placeholder="City, state or postal code"
                              maxLength={100}
                              onChange={(e) =>
                                patch({
                                  location: e.target.value,
                                  reviewed: false,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="inline-note subtle">
                          <ShieldCheck size={18} />
                          <span>
                            Demo delivery settings only. Live publishing will
                            also require your marketplace’s shipping and return
                            policies.
                          </span>
                        </div>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={item.reviewed}
                            onChange={(e) =>
                              patch({ reviewed: e.target.checked })
                            }
                          />
                          <span>
                            I’ve checked the photos, price, description, and
                            delivery details.
                          </span>
                        </label>
                        {footer(
                          "All selected marketplaces publish together.",
                          <Button type="submit" disabled={!ready}>
                            {pendingTargets.length
                              ? `Publish to ${pendingTargets.length} marketplace${pendingTargets.length === 1 ? "" : "s"}`
                              : "Select a marketplace"}
                            <ArrowRight size={16} />
                          </Button>,
                        )}
                      </form>
                    )}
                  </>
                )}
              </div>
            )}
            {step === 4 && (
              <div className="step-content batch-results">
                <div className="step-intro">
                  {liveTargets.length > 0 && !busy && (
                    <span className="success-symbol">
                      <CheckCircle2 size={27} />
                    </span>
                  )}
                  <h2>
                    {busy
                      ? "Finding more places to sell."
                      : failedTargets.length
                        ? "Some listings need another try."
                        : liveTargets.length && !pendingTargets.length
                          ? "Your listings are live."
                          : "Ready to publish together."}
                  </h2>
                  <p>
                    {busy
                      ? "Publishing each selected marketplace. You can follow the progress below."
                      : `${liveTargets.length} of ${targets.length} selected marketplaces live in demo mode.`}
                  </p>
                </div>
                <div className="publish-platforms" aria-live="polite">
                  {targets.map((p) => {
                    const listing = item.listings[p];
                    const sending = publishingTargets.includes(p);
                    return (
                      <div className="publish-platform" key={p}>
                        <PlatformLogo platform={p} />
                        <div className="publish-platform-copy">
                          <h3>{platformNames[p]}</h3>
                          <p>
                            {sending
                              ? "Publishing your listing…"
                              : listing.status === "live"
                                ? "Published successfully · demo"
                                : listing.status === "error"
                                  ? listing.error
                                  : !state.connections[p]
                                    ? "Reconnect this marketplace to publish"
                                    : "Ready to publish"}
                          </p>
                        </div>
                        {sending ? (
                          <Badge tone="neutral">
                            <LoaderCircle className="spin" size={14} />
                            Publishing
                          </Badge>
                        ) : (
                          <Badge
                            tone={
                              listing.status === "live"
                                ? "green"
                                : listing.status === "error"
                                  ? "red"
                                  : "neutral"
                            }
                          >
                            {listing.status === "live" ? (
                              <>
                                <Check size={13} />
                                Live
                              </>
                            ) : listing.status === "error" ? (
                              "Failed"
                            ) : (
                              "Ready"
                            )}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!busy && pendingTargets.length > 0 && (
                  <div className="step-footer">
                    <Button variant="secondary" onClick={() => setStep(3)}>
                      Review selection
                    </Button>
                    <Button disabled={!ready} onClick={publish}>
                      {failedTargets.length
                        ? `Retry ${pendingTargets.length} remaining`
                        : `Publish to ${pendingTargets.length} marketplaces`}
                      <ArrowRight size={16} />
                    </Button>
                  </div>
                )}
                {!targets.length && (
                  <Button onClick={() => setStep(3)}>
                    Choose marketplaces
                    <ArrowRight size={16} />
                  </Button>
                )}
                {liveTargets.length > 0 && !busy && (
                  <div className="publish-success">
                    <span>
                      Successful listings stay live. Retrying only submits the
                      remaining marketplaces.
                    </span>
                    <Button onClick={() => navigate(`/items/${id}`)}>
                      Track this item
                      <ArrowRight size={17} />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </fieldset>
          {busy && step !== 4 && (
            <div className="working-overlay" role="status">
              <div className="working-orb">
                <LoaderCircle size={29} className="spin" />
              </div>
              <h3>{busy}</h3>
              <p>Your selling sidekick is on it.</p>
              <Badge tone="neutral">Simulated service · Demo mode</Badge>
            </div>
          )}
        </section>
        <ItemSummary item={item} />
      </div>
      <div className="workspace-bottom">
        {step > 0 && step < 4 ? (
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={() => {
              setStep(step - 1);
              setError("");
            }}
          >
            <ArrowLeft size={15} />
            Back to {steps[step - 1].toLowerCase()}
          </Button>
        ) : (
          <span />
        )}
        <DemoNote />
      </div>
    </div>
  );
}
function PlusIcon() {
  return <span>+</span>;
}
function ArrowUpRightIcon(props: { size?: number }) {
  return <ExternalLink {...props} />;
}
