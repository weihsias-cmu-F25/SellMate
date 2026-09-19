import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "./components";
import {
  answerDetail,
  editDetail,
  nextDetailQuestion,
} from "./detailQuestions";
import { itemName, revise, type DetailField, type Item } from "./model";
import { sellingService } from "./services";
import { useStore } from "./store";

const labels: Record<DetailField, string> = {
  brand: "Brand",
  model: "Model",
  category: "Item type",
  purchased: "Purchased",
  condition: "Condition",
  functional: "Working condition",
  damage: "Wear or issues",
  accessories: "Included",
  dimensions: "Dimensions",
  sellSpeed: "Sell timeline",
};

const CATEGORIES = ["Headphones", "Cameras", "Home & living", "Other"];

const FALLBACK_CHOICES: Partial<
  Record<DetailField, { label: string; value: string }[]>
> = {
  condition: [
    { label: "Like new", value: "Excellent" },
    { label: "Light wear", value: "Good" },
    { label: "Visible wear", value: "Fair" },
  ],
  functional: [
    { label: "Works perfectly", value: "Fully functional" },
    { label: "Minor issues", value: "Minor issues" },
    { label: "Not working", value: "Not working" },
  ],
  sellSpeed: [
    { label: "ASAP (1–3 days)", value: "quick" },
    { label: "About a week", value: "normal" },
    { label: "Not in a hurry", value: "max" },
  ],
  damage: [
    { label: "No damage", value: "None" },
    { label: "Light scratches", value: "Light scratches" },
    { label: "Visible wear", value: "Visible wear" },
  ],
  accessories: [
    { label: "Nothing extra", value: "None" },
    { label: "Original box", value: "Original box" },
    { label: "Cables / extras", value: "Cables included" },
  ],
  purchased: [
    { label: "Under a year", value: "Less than 1 year" },
    { label: "1–3 years", value: "1-3 years" },
    { label: "3+ years", value: "3+ years" },
  ],
  dimensions: [
    { label: "Not sure", value: "Not sure" },
    { label: "Compact / small", value: "Small" },
    { label: "Standard size", value: "Standard" },
  ],
  brand: [
    { label: "Not sure", value: "Unknown" },
    { label: "No brand / generic", value: "Unbranded" },
  ],
  model: [
    { label: "Not sure", value: "Unknown" },
    { label: "Skip for now", value: "Unknown" },
  ],
  category: [
    { label: "Home & living", value: "Home & living" },
    { label: "Electronics", value: "Electronics" },
    { label: "Other", value: "Other" },
  ],
};

export function DetailsChat({
  item,
  onContinue,
}: {
  item: Item;
  onContinue: () => void;
}) {
  const { updateItem } = useStore();
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState(false);
  const [draftBrand, setDraftBrand] = useState(item.brand);
  const [draftModel, setDraftModel] = useState(item.model);
  const [draftCategory, setDraftCategory] = useState(item.category);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const thread = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const previousQuestion = useRef<string | undefined>(undefined);
  const question = nextDetailQuestion(item);
  const replies = item.detailReplies || [];
  const planTotal = item.questionPlan?.length ?? 0;
  const remaining =
    item.questionPlan?.filter((q) => {
      const value = item[q.field];
      return !(typeof value === "string" ? value.trim() : value);
    }).length ?? 0;
  const choices =
    question &&
    (question.choices?.length
      ? question.choices
      : FALLBACK_CHOICES[question.field] || [
          { label: "Not sure", value: "Not sure" },
          { label: "Other / type below", value: "Other" },
        ]);
  const showChoices = !!question && !!choices?.length;
  const showText = !!question;

  useEffect(() => {
    if (!editingId) {
      setDraftBrand(item.brand);
      setDraftModel(item.model);
      setDraftCategory(item.category);
    }
  }, [item.brand, item.model, item.category, editingId]);

  useEffect(() => {
    const node = thread.current;
    if (!node) return;
    requestAnimationFrame(() => {
      const current = node.querySelector(".chat-current") as HTMLElement | null;
      if (current) {
        const top = current.offsetTop - 12;
        node.scrollTop = Math.max(0, top);
      } else {
        node.scrollTop = node.scrollHeight;
      }
      // Keep the answer controls on-screen after each question.
      root.current
        ?.querySelector(".chat-answer-area, .chat-complete")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    if (previousQuestion.current !== question?.field) {
      root.current
        ?.querySelector<HTMLButtonElement>(
          ".chat-choices button, .chat-complete button",
        )
        ?.focus({ preventScroll: true });
      setMessage("");
    }
    previousQuestion.current = question?.field;
  }, [question?.field, question?.text, replies.length]);

  useEffect(() => {
    requestAnimationFrame(() => {
      root.current
        ?.querySelector(".details-chat-panel")
        ?.scrollIntoView({ block: "nearest" });
    });
  }, []);

  const answer = (text: string, value?: string) => {
    if (question && text.trim())
      updateItem(item.id, (current) =>
        answerDetail(current, question, text, value),
      );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    answer(message);
  };
  const edit = (field: DetailField) =>
    updateItem(item.id, (current) => editDetail(current, field));

  const saveIdentity = async () => {
    setRefreshError("");
    setRefreshing(true);
    try {
      const next = {
        brand: draftBrand.trim(),
        model: draftModel.trim(),
        category: draftCategory.trim() || "Other",
      };
      updateItem(item.id, (current) =>
        revise(current, {
          ...next,
          detailReplies: [],
          questionPlan: undefined,
          research: undefined,
        }),
      );
      const plan = await sellingService.refreshQuestions({
        ...item,
        ...next,
        detailReplies: [],
      });
      updateItem(item.id, (current) =>
        revise(current, {
          ...next,
          questionPlan: plan,
          detailReplies: [],
        }),
      );
      setEditingId(false);
    } catch (error) {
      setRefreshError(
        error instanceof Error ? error.message : "Could not refresh questions",
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="details-chat" ref={root}>
      <div className="step-intro">
        <h2>Let’s talk about your item.</h2>
        <p>
          {planTotal > 0
            ? remaining > 0
              ? `I filled in what I could see. ${remaining} question${remaining === 1 ? "" : "s"} left (${planTotal} total).`
              : `All ${planTotal} questions answered — review the summary below.`
            : "A few quick questions. Answer however you like."}
        </p>
      </div>

      <div className="identity-card">
        {!editingId ? (
          <>
            <div>
              <p className="identity-label">Detected item</p>
              <p className="identity-name">{itemName(item) || "Unknown item"}</p>
              <p className="muted">
                {item.category}
                {item.identificationNotes
                  ? ` · ${item.identificationNotes}`
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              className="button-secondary"
              onClick={() => setEditingId(true)}
            >
              <Pencil size={15} />
              Fix identification
            </Button>
          </>
        ) : (
          <div className="identity-edit">
            <p className="identity-label">Correct the identification</p>
            <label>
              Brand
              <input
                value={draftBrand}
                onChange={(e) => setDraftBrand(e.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              Model
              <input
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
                maxLength={80}
              />
            </label>
            <label>
              Category
              <select
                value={draftCategory}
                onChange={(e) => setDraftCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="identity-actions">
              <Button
                type="button"
                onClick={() => void saveIdentity()}
                disabled={refreshing || !draftBrand.trim()}
              >
                {refreshing ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
                Save & refresh questions
              </Button>
              <Button
                type="button"
                className="button-secondary"
                onClick={() => setEditingId(false)}
                disabled={refreshing}
              >
                Cancel
              </Button>
            </div>
            {refreshError && <p className="error-text">{refreshError}</p>}
          </div>
        )}
      </div>

      <div className="details-chat-panel">
      <div
        className="details-thread"
        ref={thread}
        role="log"
        aria-label="Conversation with SellMate"
        aria-live="polite"
      >
        <div className="chat-agent">
          <span className="chat-avatar">
            <Sparkles size={16} />
          </span>
          <div className="chat-bubble">
            {item.brand && item.model ? (
              <>
                <strong>{item.identificationNotes || `I’ve got your ${itemName(item)}.`}</strong>
                <p>
                  I’ll only ask about what I still need to confirm before pricing.
                </p>
              </>
            ) : (
              "Photo received! Let’s fill in the details together."
            )}
          </div>
        </div>
        {replies.map((reply) => (
          <div className="chat-exchange" key={reply.field}>
            <div className="chat-agent chat-history">
              <span className="chat-avatar">
                <Sparkles size={16} />
              </span>
              <div className="chat-bubble">{reply.question}</div>
            </div>
            <div className="chat-user">
              <button
                type="button"
                className="chat-edit"
                aria-label={`Edit answer: ${labels[reply.field]}`}
                onClick={() => edit(reply.field)}
              >
                <Pencil size={14} />
              </button>
              <div className="chat-bubble">{reply.answer}</div>
            </div>
          </div>
        ))}
        <div className="chat-agent chat-current">
          <span className="chat-avatar">
            <Sparkles size={16} />
          </span>
          <div className="chat-bubble">
            {question ? (
              <>
                <strong>{question.text}</strong>
                {question.hint && <p>{question.hint}</p>}
              </>
            ) : (
              <>
                <strong>That’s everything I need. Thanks!</strong>
                <p>Let’s find a good starting price for your item.</p>
              </>
            )}
          </div>
        </div>
      </div>
      {question ? (
        <div className="chat-answer-area">
          {showChoices && (
            <div className="chat-choices" aria-label="Quick answers">
              {choices!.map((choice) => (
                <button
                  type="button"
                  key={`${choice.value}-${choice.label}`}
                  onClick={() => answer(choice.label, choice.value)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          )}
          {showText && (
            <form className="chat-composer" onSubmit={submit}>
              <input
                aria-label="Your answer"
                placeholder={question.placeholder}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                autoComplete="off"
              />
              <button
                type="submit"
                aria-label="Send answer"
                disabled={!message.trim()}
              >
                <Send size={18} />
              </button>
            </form>
          )}
          <p className="chat-hint">
            Tap a quick answer, or type your own below.
          </p>
        </div>
      ) : (
        <div className="chat-complete">
          <div className="info-summary">
            <p className="identity-label">Item summary</p>
            <ul>
              <li>
                <strong>Item:</strong> {itemName(item) || "—"}
              </li>
              <li>
                <strong>Category:</strong> {item.category || "—"}
              </li>
              {item.condition && (
                <li>
                  <strong>Condition:</strong> {item.condition}
                </li>
              )}
              {item.dimensions && (
                <li>
                  <strong>Dimensions:</strong> {item.dimensions}
                </li>
              )}
              {item.damage && (
                <li>
                  <strong>Notes:</strong> {item.damage}
                </li>
              )}
              {item.functional && (
                <li>
                  <strong>Working:</strong> {item.functional}
                </li>
              )}
              {item.accessories && (
                <li>
                  <strong>Included:</strong> {item.accessories}
                </li>
              )}
              {item.sellSpeed && (
                <li>
                  <strong>Sell timeline:</strong>{" "}
                  {item.sellSpeed === "quick"
                    ? "ASAP"
                    : item.sellSpeed === "max"
                      ? "Not in a hurry"
                      : "About a week"}
                </li>
              )}
              {item.purchased && (
                <li>
                  <strong>Owned:</strong> {item.purchased}
                </li>
              )}
            </ul>
          </div>
          <span className="chat-ready">
            <Check size={16} />
            Details gathered
            {planTotal
              ? ` · ${planTotal} questions`
              : replies.length
                ? ` · ${replies.length} answers`
                : ""}
          </span>
          <Button onClick={onContinue}>
            Find my price
            <ArrowRight size={17} />
          </Button>
        </div>
      )}
      </div>
      <details className="chat-review">
        <summary>
          {question ? "Review or change item details" : "Review my answers"}
        </summary>
        <dl>
          {(Object.keys(labels) as DetailField[])
            .filter((field) => !!item[field])
            .map((field) => (
              <div key={field}>
                <dt>{labels[field]}</dt>
                <dd>{item[field]}</dd>
                <button
                  type="button"
                  onClick={() => edit(field)}
                  aria-label={`Change ${labels[field]}`}
                >
                  <Pencil size={13} />
                </button>
              </div>
            ))}
        </dl>
      </details>
    </div>
  );
}
