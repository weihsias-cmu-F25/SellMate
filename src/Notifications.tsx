import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ageInDays,
  money,
  needsReview,
  suggestedPrice,
  type Item,
} from "./model";

type Reminder = {
  id: string;
  itemId: string;
  title: string;
  price: number;
  suggested: number;
  read: boolean;
};
const storageKey = "sellmate-notifications-v1";
function loadReminders(): Reminder[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (r): r is Reminder =>
        r &&
        typeof r.id === "string" &&
        typeof r.itemId === "string" &&
        typeof r.title === "string" &&
        typeof r.price === "number" &&
        Number.isFinite(r.price) &&
        typeof r.suggested === "number" &&
        Number.isFinite(r.suggested) &&
        typeof r.read === "boolean",
    );
  } catch {
    return [];
  }
}

export function Notifications({
  items,
  reminderDays,
}: {
  items: Item[];
  reminderDays: number;
}) {
  const [reminders, setReminders] = useState(loadReminders);
  const [open, setOpen] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    setReminders((previous) => {
      const retained = previous.filter((r) =>
        items.some((item) => item.id === r.itemId),
      );
      const next = [...retained];
      for (const item of items.filter((item) =>
        needsReview(item, reminderDays),
      )) {
        const id = `${item.id}:${item.lastReviewAt || item.publishedAt}:${item.price}`;
        if (next.some((r) => r.id === id)) continue;
        next.unshift({
          id,
          itemId: item.id,
          title: `${item.model || "Your item"} hasn’t sold in ${ageInDays(item.publishedAt)} days`,
          price: item.price,
          suggested: suggestedPrice(item.price),
          read: false,
        });
      }
      return next.length === previous.length &&
        next.every((r, index) => r === previous[index])
        ? previous
        : next;
    });
  }, [items, reminderDays]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(reminders));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  }, [reminders]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const unread = reminders.filter((r) => !r.read).length;
  return (
    <>
      <button
        className="notification-button"
        aria-label={`Notifications, ${unread} unread`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Bell size={18} />
        {unread > 0 && <span className="notification-dot" />}
      </button>
      <dialog
        ref={dialog}
        className="notification-inbox"
        aria-labelledby="notification-title"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom
            )
              setOpen(false);
          }
        }}
      >
        <header className="notification-inbox-header">
          <h2 id="notification-title">
            Notifications{" "}
            {unread > 0 && <span className="count-label">{unread}</span>}
          </h2>
          <button
            className="notification-close"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          >
            <X size={20} />
          </button>
        </header>
        {unread > 0 && (
          <button
            className="text-button notification-mark-read"
            onClick={() =>
              setReminders((current) =>
                current.map((r) => ({ ...r, read: true })),
              )
            }
          >
            Mark all as read
          </button>
        )}
        {storageFailed && (
          <p className="notification-empty">
            Notifications can’t be saved in this browser right now.
          </p>
        )}
        <div className="notification-list">
          {reminders.length ? (
            reminders.map((reminder) => {
              const item = items.find((item) => item.id === reminder.itemId);
              const pending =
                item &&
                needsReview(item, reminderDays) &&
                item.price === reminder.price &&
                `${item.id}:${item.lastReviewAt || item.publishedAt}:${item.price}` ===
                  reminder.id;
              return (
                <article
                  key={reminder.id}
                  className={`notification-message ${reminder.read ? "" : "unread"}`}
                >
                  <h3>{reminder.title}</h3>
                  <p>
                    Suggested price: {money(reminder.price)} →{" "}
                    <strong>{money(reminder.suggested)}</strong>
                  </p>
                  {!pending && (
                    <span className="notification-history">Past reminder</span>
                  )}
                  <Link
                    className="text-button"
                    to={`/items/${reminder.itemId}`}
                    onClick={() => {
                      setReminders((current) =>
                        current.map((r) =>
                          r.id === reminder.id ? { ...r, read: true } : r,
                        ),
                      );
                      setOpen(false);
                    }}
                  >
                    {pending ? "Review price" : "View item"}
                  </Link>
                </article>
              );
            })
          ) : (
            <p className="notification-empty">
              You’re all caught up. Price reminders will appear here.
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
