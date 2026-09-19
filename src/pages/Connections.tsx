import { useEffect, useState } from "react";
import {
  Check,
  Clock3,
  FlaskConical,
  Link2,
  RotateCcw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { Badge, Button, Modal, PageHeading, PlatformLogo } from "../components";
import { PLATFORMS, platformNames } from "../model";
import { useStore } from "../store";

export function Connections() {
  const { state, settings, notify, reset, updateItem } = useStore(),
    [resetMode, setResetMode] = useState<"sample" | "empty" | null>(null),
    location = useLocation();
  useEffect(() => {
    if (location.hash === "#demo")
      document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
  }, [location.hash]);
  const ageDemo = () => {
    const date = new Date(Date.now() - 8 * 86400000).toISOString();
    state.items
      .filter((i) => i.status === "active")
      .forEach((i) =>
        updateItem(i.id, (item) => ({
          ...item,
          publishedAt: date,
          lastReviewAt: undefined,
        })),
      );
    notify(
      "Active items are now 8 days old in this demo. Visit Overview to review them.",
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="YOUR MARKETPLACES"
        title="Connect once. Sell simply."
        description="A home for your accounts, preferences, and a little peace of mind."
      />
      <div className="settings-grid">
        <div className="settings-main">
          <section className="panel settings-panel">
            <div className="section-heading">
              <div>
                <h2>Marketplace connections</h2>
                <p className="muted small-text">
                  Choose where your items will find their next owners.
                </p>
              </div>
              <Link2 size={20} className="muted" />
            </div>
            {PLATFORMS.map((p) => (
              <div className="connection-row" key={p}>
                <PlatformLogo platform={p} />
                <div>
                  <h3>{platformNames[p]}</h3>
                  <p>
                    {p === "ebay"
                      ? state.connected
                        ? "Demo account connected"
                        : "No demo account connected"
                      : "Open marketplace, publish, and record the link"}
                  </p>
                </div>
                {p === "ebay" ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      settings({ connected: !state.connected });
                      notify(
                        state.connected
                          ? "Demo account disconnected."
                          : "Demo account connected. No real authorization was performed.",
                      );
                    }}
                  >
                    {state.connected ? (
                      <>
                        <Unplug size={14} />
                        Disconnect
                      </>
                    ) : (
                      <>
                        <Link2 size={14} />
                        Connect demo account
                      </>
                    )}
                  </Button>
                ) : (
                  <Badge tone="neutral">Manual handoff</Badge>
                )}
              </div>
            ))}
          </section>
          <section className="panel settings-panel">
            <div className="section-heading">
              <div>
                <h2>A timely little nudge</h2>
                <p className="muted small-text">
                  Give your unsold items a fresh look.
                </p>
              </div>
              <Clock3 size={20} className="muted" />
            </div>
            <label>
              Suggest a price review after
              <select
                value={state.reminderDays}
                onChange={(e) => {
                  settings({ reminderDays: Number(e.target.value) });
                  notify("Price review preference saved.");
                }}
              >
                <option value="7">7 days unsold</option>
                <option value="14">14 days unsold</option>
                <option value="0">Don’t suggest price reviews</option>
              </select>
            </label>
            <div className="preference-note">
              <Check size={15} />
              <span>Always ask me before changing a price.</span>
            </div>
            <p className="small-text muted">
              Suggestions appear when you open SellMate. This frontend doesn’t
              send background notifications.
            </p>
          </section>
          <section id="demo" className="panel settings-panel demo-settings">
            <div className="section-heading">
              <div>
                <h2>Make yourself at home</h2>
                <p className="muted small-text">
                  Try the full experience in this demo workspace.
                </p>
              </div>
              <FlaskConical size={20} className="muted" />
            </div>
            <p>
              Photos and drafts are saved in this browser. Product recognition,
              price comparisons, account connections, publishing, and eBay
              removal are simulated.
            </p>
            <div className="demo-setting-row">
              <div>
                <h3>Try a price review</h3>
                <p>Make active items 8 days old.</p>
              </div>
              <Button
                variant="secondary"
                disabled={!state.items.some((i) => i.status === "active")}
                onClick={ageDemo}
              >
                Advance demo
                <Clock3 size={14} />
              </Button>
            </div>
            <div className="demo-setting-row">
              <div>
                <h3>Bring back the examples</h3>
                <p>Replace this workspace with the sample items.</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setResetMode("sample")}
              >
                <RotateCcw size={14} />
                Reset demo
              </Button>
            </div>
            <div className="demo-setting-row">
              <div>
                <h3>Start with a clean shelf</h3>
                <p>Remove saved items and start from scratch.</p>
              </div>
              <Button variant="ghost" onClick={() => setResetMode("empty")}>
                Start fresh
              </Button>
            </div>
          </section>
        </div>
        <aside className="connection-aside">
          <div className="connection-art">
            <div className="connection-art-center">
              <Link2 size={27} />
            </div>
            <span className="connection-art-node node-ebay">
              <PlatformLogo platform="ebay" />
            </span>
            <span className="connection-art-node node-facebook">
              <PlatformLogo platform="facebook" />
            </span>
            <span className="connection-art-node node-offerup">
              <PlatformLogo platform="offerup" />
            </span>
          </div>
          <h3>
            Your item.
            <br />
            More possibilities.
          </h3>
          <p>
            Get every listing ready in one place, and keep track of what happens
            next.
          </p>
          <div className="connection-trust">
            <ShieldCheck size={18} />
            <span>
              You decide what gets published, when the price changes, and when a
              listing comes down.
            </span>
          </div>
        </aside>
      </div>
      {resetMode && (
        <Modal
          title={
            resetMode === "empty"
              ? "Start with a clean shelf?"
              : "Reset your demo workspace?"
          }
          onClose={() => setResetMode(null)}
        >
          <p className="muted">
            This replaces all items, uploaded photos, and settings saved in this
            browser. It won’t affect any external marketplace.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setResetMode(null)}>
              Keep my workspace
            </Button>
            <Button
              onClick={() => {
                reset(resetMode === "empty");
                setResetMode(null);
                notify(
                  resetMode === "empty"
                    ? "Your workspace is ready for its first item."
                    : "Sample workspace restored.",
                );
              }}
            >
              {resetMode === "empty" ? "Clear workspace" : "Restore examples"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
