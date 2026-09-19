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
  log,
  money,
  PLATFORMS,
  ASSISTED_PLATFORMS,
  INTEGRATED_PLATFORMS,
  PUBLISH_PLATFORMS,
  platformNames,
  platformUrls,
  revise,
  validateListingUrl,
  type Item,
  type Platform,
} from "../model";
import { readPhoto, sellingService } from "../services";
import { useStore, useTask } from "../store";

import { DetailsChat } from "../DetailsChat";
import {
  openFacebookMarketplaceDraft,
  subscribeToFacebookPublish,
} from "../facebookMarketplace";
import {
  openVintedDraft,
  subscribeToVintedPublish,
} from "../vintedMarketplace";
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
    [platform, setPlatform] = useState<Platform>("vinted");
  const [showComparables, setShowComparables] = useState(false),
    [dragging, setDragging] = useState(false);
  const [publishingTargets, setPublishingTargets] = useState<Platform[]>([]);
  const uploadRef = useRef<HTMLInputElement>(null),
    cameraRef = useRef<HTMLInputElement>(null),
    assistedStatusRef = useRef<Record<"vinted" | "facebook", string>>({
      vinted: "",
      facebook: "",
    });
  const { busy, error, setError, run } = useTask();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  useEffect(() => {
    const handleStatus = (
      platform: "vinted" | "facebook",
      status: {
        requestId: string;
        itemId: string;
        state: "opened" | "filled" | "submitting" | "live" | "error";
        message?: string;
        url?: string;
      },
    ) => {
      if (status.itemId !== id) return;
      const name = platformNames[platform];
      console.info(`[SellMate ${name}] Publish status`, status);
      const statusKey = `${status.requestId}:${status.state}:${status.url || ""}`;
      if (assistedStatusRef.current[platform] === statusKey) return;
      assistedStatusRef.current[platform] = statusKey;
      if (status.state === "error") {
        const message = status.message || `${name} could not fill this draft.`;
        setError(message);
        updateItem(id, (current) => ({
          ...current,
          listings: {
            ...current.listings,
            [platform]: {
              ...current.listings[platform],
              status: "error",
              managed: false,
              error: message,
            },
          },
        }));
        setPublishingTargets((current) =>
          current.filter((target) => target !== platform),
        );
        return;
      }
      if (status.state === "filled") {
        updateItem(id, (current) => ({
          ...current,
          listings: {
            ...current.listings,
            [platform]: {
              ...current.listings[platform],
              status: "awaiting",
              managed: false,
              error: undefined,
            },
          },
        }));
        notify(`${name} draft filled. The helper is preparing submission.`);
        return;
      }
      if (status.state === "submitting") {
        notify(`${name} is processing the listing.`);
        return;
      }
      if (status.state === "live" && status.url) {
        const url = validateListingUrl(status.url, platform);
        if (!url) {
          setError(`${name} returned an invalid listing URL.`);
          return;
        }
        updateItem(id, (current) => {
          if (
            current.listings[platform].status === "live" &&
            current.listings[platform].url === url
          )
            return current;
          const publishedAt = new Date().toISOString();
          return log(
            {
              ...current,
              status: "active",
              publishedAt: current.publishedAt || publishedAt,
              listings: {
                ...current.listings,
                [platform]: {
                  ...current.listings[platform],
                  status: "live",
                  managed: false,
                  url,
                  price: current.price,
                  error: undefined,
                  publishedAt,
                },
              },
            },
            `${name} listing confirmed`,
          );
        });
        notify(`${name} listing confirmed and added to tracking.`);
      }
    };
    const unsubscribeFacebook = subscribeToFacebookPublish((status) =>
      handleStatus("facebook", status),
    );
    const unsubscribeVinted = subscribeToVintedPublish((status) =>
      handleStatus("vinted", status),
    );
    return () => {
      unsubscribeFacebook();
      unsubscribeVinted();
    };
  }, [id, notify, setError, updateItem]);
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
    void run("Preparing your photos…", async (signal) => {
      const photos = await Promise.all(incoming.map(readPhoto));
      if (signal.aborted) return;
      updateItem(id, (i) => ({
        ...i,
        sample: false,
        photos: [...i.photos, ...photos],
        reviewed: false,
      }));
    });
  };
  const useSample = () =>
    void run("Taking a closer look…", async (signal) => {
      const result = await sellingService.identifySample(signal);
      updateItem(id, (i) =>
        log(
          {
            ...i,
            ...result,
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
          "Example price research prepared",
        ),
      );
      setStep(2);
    });
  const generate = () => {
    updateItem(id, (i) =>
      log(
        { ...generateListings(i), stage: Math.max(3, i.stage) },
        "Marketplace drafts generated",
      ),
    );
    setStep(3);
  };
  const targets = selectedPlatforms(item, state.connections);
  const managedTargets = targets.filter((p) =>
    INTEGRATED_PLATFORMS.includes(p),
  );
  const pendingTargets = targets.filter(
    (p) => item.listings[p].status !== "live",
  );
  const pendingManagedTargets = managedTargets.filter(
    (p) => item.listings[p].status !== "live",
  );
  const facebookPending =
    targets.includes("facebook") && item.listings.facebook.status !== "live";
  const vintedPending =
    targets.includes("vinted") && item.listings.vinted.status !== "live";
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
  const startAssistedPublish = async (
    assistedPlatform: "vinted" | "facebook",
    openDraft: (draftItem: Item) => Promise<string>,
    signal: AbortSignal,
  ) => {
    const name = platformNames[assistedPlatform];
    try {
      console.info(`[SellMate ${name}] Sending draft to browser helper`, {
        itemId: item.id,
      });
      await openDraft(item);
      if (signal.aborted) return { ok: false, error: "Publishing cancelled." };
      updateItem(id, (current) =>
        log(
          {
            ...current,
            listings: {
              ...current.listings,
              [assistedPlatform]: {
                ...current.listings[assistedPlatform],
                status: "awaiting",
                managed: false,
                error: undefined,
              },
            },
          },
          `${name} submission sent to browser helper`,
        ),
      );
      console.info(`[SellMate ${name}] Browser helper accepted the draft`);
      return { ok: true };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `${name} publishing could not start.`;
      console.error(`[SellMate ${name}] Could not start publishing`, error);
      if (!signal.aborted)
        updateItem(id, (current) => ({
          ...current,
          listings: {
            ...current.listings,
            [assistedPlatform]: {
              ...current.listings[assistedPlatform],
              status: "error",
              managed: false,
              error: message,
            },
          },
        }));
      return { ok: false, error: message };
    } finally {
      setPublishingTargets((current) =>
        current.filter((target) => target !== assistedPlatform),
      );
    }
  };
  const publish = () => {
    if (!ready) return;
    setStep(4);
    updateItem(id, (i) => ({ ...i, stage: 4, publishTargets: targets }));
    void run("Publishing selected marketplaces…", async (signal) => {
      setPublishingTargets(pendingTargets);
      try {
        const managedPublishing = pendingManagedTargets.length
          ? publishBatch(
              item,
              pendingManagedTargets,
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
                setPublishingTargets((current) =>
                  current.filter((t) => t !== p),
                );
              },
              signal,
            )
          : Promise.resolve([]);
        const facebookPublishing = facebookPending
          ? startAssistedPublish(
              "facebook",
              openFacebookMarketplaceDraft,
              signal,
            )
          : Promise.resolve({ ok: false, error: "" });
        const vintedPublishing = vintedPending
          ? startAssistedPublish("vinted", openVintedDraft, signal)
          : Promise.resolve({ ok: false, error: "" });
        const [results, facebookResult, vintedResult] = await Promise.all([
          managedPublishing,
          facebookPublishing,
          vintedPublishing,
        ]);
        const succeeded = results.filter((r) => r.ok).length;
        const assistedStarted = [
          facebookResult.ok && "Facebook",
          vintedResult.ok && "Vinted",
        ].filter(Boolean);
        const assistedErrors = [
          facebookPending && !facebookResult.ok
            ? `Facebook: ${facebookResult.error}`
            : "",
          vintedPending && !vintedResult.ok
            ? `Vinted: ${vintedResult.error}`
            : "",
        ].filter(Boolean);
        if (assistedErrors.length)
          notify(
            `${succeeded ? `${succeeded} demo marketplace published. ` : ""}${assistedErrors.join(" · ")}`,
          );
        else if (assistedStarted.length)
          notify(
            `${assistedStarted.join(" and ")} submission${assistedStarted.length === 1 ? "" : "s"} started${succeeded ? `; ${succeeded} demo marketplace published` : ""}.`,
          );
        else
          notify(
            results.length > 0 && succeeded === results.length
              ? `Published to ${succeeded} marketplace${succeeded === 1 ? "" : "s"} in demo mode.`
              : `${succeeded} published. Review the marketplace errors below.`,
          );
      } finally {
        if (!signal.aborted) setPublishingTargets([]);
      }
    });
  };
  const openHandoff = (p: Platform) => {
    updateItem(id, (i) => ({
      ...i,
      listings: {
        ...i.listings,
        [p]: { ...i.listings[p], status: "awaiting" },
      },
    }));
    notify(
      `Finish on ${platformNames[p]}, then record the live listing link in Item details.`,
    );
  };
  const currentListing = item.listings[platform];
  const baseReady =
    item.reviewed &&
    item.photos.length > 0 &&
    item.price > 0 &&
    !!item.location.trim() &&
    pendingTargets.length > 0;
  const facebookReady =
    !facebookPending ||
    (!!item.listings.facebook.title.trim() &&
      !!item.listings.facebook.description.trim() &&
      item.listings.facebook.price === item.price);
  const vintedReady =
    !vintedPending ||
    (!!item.listings.vinted.title.trim() &&
      !!item.listings.vinted.description.trim() &&
      item.listings.vinted.price === item.price);
  const managedReady =
    !pendingManagedTargets.length ||
    canPublish(item, pendingManagedTargets, state.connections);
  const ready = baseReady && facebookReady && vintedReady && managedReady;
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
                        Here’s an example comparison for your {item.model}.
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
                        {item.research.comparables.length} example comparables
                      </span>
                      <span>USD · Demo research</span>
                    </div>
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
                            Illustrative results, not a live market search.
                            Adjusted for your selected condition.
                          </p>
                          {item.research.comparables.map((c) => (
                            <div className="comparable" key={c.id}>
                              <div>
                                <strong>{c.title}</strong>
                                <span>
                                  {c.platform} · {c.condition} ·{" "}
                                  <span
                                    className={
                                      c.type === "Sold" ? "text-green" : ""
                                    }
                                  >
                                    {c.type}
                                  </span>
                                </span>
                              </div>
                              <strong>{money(c.price)}</strong>
                            </div>
                          ))}
                          <p className="small-text muted">
                            Prepared{" "}
                            {new Date(
                              item.research.checkedAt,
                            ).toLocaleDateString()}
                            . Real source links will appear when live search is
                            connected.
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
                    {PUBLISH_PLATFORMS.map((p) => (
                      <label
                        key={p}
                        className={`publish-choice ${targets.includes(p) ? "selected" : ""}`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Publish on ${platformNames[p]}`}
                          checked={targets.includes(p)}
                          disabled={
                            item.listings[p].status === "live" ||
                            (INTEGRATED_PLATFORMS.includes(p) &&
                              !state.connections[p] &&
                              !targets.includes(p))
                          }
                          onChange={(e) => toggleTarget(p, e.target.checked)}
                        />
                        <PlatformLogo platform={p} />
                        <span>
                          <strong>{platformNames[p]}</strong>
                          <small>
                            {item.listings[p].status === "live"
                              ? "Already live · won’t repost"
                              : ASSISTED_PLATFORMS.includes(p)
                                ? "Browser helper · automatic submission"
                                : state.connections[p]
                                  ? "Connected · ready to publish"
                                  : "Not connected"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <Link to="/connections" className="text-button">
                    Manage connections
                    <Link2 size={14} />
                  </Link>
                </fieldset>
                <p className="draft-preview-label">
                  Preview & edit each draft{" "}
                  <span>Switching previews doesn’t change your selection.</span>
                </p>
                <div className="platform-tabs" aria-label="Draft preview only">
                  {PLATFORMS.map((p) => (
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
                      Your details changed. Refresh your drafts to bring them up
                      to date.
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
                        {platform === "vinted" ? 100 : 120}
                      </span>
                      <input
                        required
                        maxLength={platform === "vinted" ? 100 : 120}
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
                            patch({ delivery: e.target.value, reviewed: false })
                          }
                        >
                          <option>Buyer-paid shipping</option>
                          <option>Free shipping</option>
                          <option>Local pickup</option>
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
                            patch({ location: e.target.value, reviewed: false })
                          }
                        />
                      </label>
                    </div>
                    <div className="inline-note subtle">
                      <ShieldCheck size={18} />
                      <span>
                        Demo delivery settings only. Live publishing will also
                        require your marketplace’s shipping and return policies.
                      </span>
                    </div>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={item.reviewed}
                        onChange={(e) => patch({ reviewed: e.target.checked })}
                      />
                      <span>
                        I’ve checked the photos, price, description, and
                        delivery details.
                      </span>
                    </label>
                    {footer(
                      ASSISTED_PLATFORMS.includes(platform)
                        ? `Select ${platformNames[platform]} above. The main publish button authorizes the browser helper to submit it with the other destinations.`
                        : "All selected marketplaces publish together.",
                      <Button type="submit" disabled={!ready}>
                        {pendingTargets.length
                          ? `Publish to ${pendingTargets.length} marketplace${pendingTargets.length === 1 ? "" : "s"}`
                          : "Select a marketplace"}
                        <ArrowRight size={16} />
                      </Button>,
                    )}
                  </form>
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
                      : `${liveTargets.length} of ${targets.length} selected marketplaces confirmed live.`}
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
                                ? ASSISTED_PLATFORMS.includes(p)
                                  ? "Published successfully · live URL confirmed"
                                  : "Published successfully · demo"
                                : listing.status === "error"
                                  ? listing.error
                                  : ASSISTED_PLATFORMS.includes(p) &&
                                      listing.status === "awaiting"
                                    ? "Browser helper is submitting the listing"
                                    : ASSISTED_PLATFORMS.includes(p)
                                      ? "Browser helper ready"
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
                            ) : listing.status === "awaiting" ? (
                              "Submitting"
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
                {!busy && (
                  <details className="manual-marketplaces">
                    <summary>Post to other marketplaces manually</summary>
                    <p className="small-text muted">
                      Copy a draft from Review, finish posting on the
                      marketplace, then record its live link.
                    </p>
                    {PLATFORMS.filter(
                      (p) => !PUBLISH_PLATFORMS.includes(p),
                    ).map((p) => (
                      <div className="publish-platform" key={p}>
                        <PlatformLogo platform={p} />
                        <div className="publish-platform-copy">
                          <h3>{platformNames[p]}</h3>
                          <p>
                            {item.listings[p].status === "live"
                              ? "Live link recorded"
                              : item.listings[p].status === "awaiting"
                                ? "Awaiting a live listing link"
                                : "Manual publishing"}
                          </p>
                        </div>
                        <a
                          className="button button-secondary"
                          href={platformUrls[p]}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={() => {
                            if (item.listings[p].status !== "live")
                              openHandoff(p);
                          }}
                        >
                          Open marketplace
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    ))}
                    <Link className="text-button" to={`/items/${id}`}>
                      Record a listing link
                      <ArrowRight size={15} />
                    </Link>
                  </details>
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
        {step > 0 ? (
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
