import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Pencil, Send, Sparkles } from "lucide-react";
import { Button } from "./components";
import {
  answerDetail,
  editDetail,
  nextDetailQuestion,
} from "./detailQuestions";
import { itemName, type DetailField, type Item } from "./model";
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
  const thread = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const previousQuestion = useRef<string | undefined>(undefined);
  const question = nextDetailQuestion(item),
    replies = item.detailReplies || [];
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
    if (previousQuestion.current)
      root.current
        ?.querySelector<HTMLButtonElement>(
          ".chat-choices button, .chat-complete button",
        )
        ?.focus({ preventScroll: true });
    previousQuestion.current = question?.field;
    setMessage("");
  }, [question?.field, replies.length]);
  useEffect(() => {
    const element = thread.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
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
  return (
    <div className="details-chat" ref={root}>
      <div className="step-intro">
        <h2>Let’s talk about your item.</h2>
        <p>A few quick questions. Answer however you like.</p>
      </div>
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
                I’ve got your <strong>{itemName(item)}</strong>. I’ll just ask
                for the details I’m missing.
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
          <div className="chat-choices" aria-label="Quick answers">
            {question.choices?.map((choice) => (
              <button
                type="button"
                key={choice.value}
                onClick={() => answer(choice.label, choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
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
          <p className="chat-hint">
            Pick an answer above, or type in your own words.
          </p>
        </div>
      ) : (
        <div className="chat-complete">
          <span className="chat-ready">
            <Check size={16} />
            Details gathered
          </span>
          <Button onClick={onContinue}>
            Find my price
            <ArrowRight size={17} />
          </Button>
        </div>
      )}
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
