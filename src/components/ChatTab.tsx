import { useEffect, useRef, useState } from "react";
import { ArrowRight, Brain, LoaderCircle, Send, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHAT_AGENT_ACTIVITY_LOGS, CHAT_COPY } from "@/lib/chat-copy";
import { isSupportedProductDetailUrl } from "@/lib/product-types";

const AGENT_STEP_MIN_MS = 1500;
const AGENT_MIN_THINKING_MS = CHAT_AGENT_ACTIVITY_LOGS.length * AGENT_STEP_MIN_MS;

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "loading"; activeStep: number }
  | { id: string; role: "assistant"; productName: string }
  | { id: string; role: "notice"; text: string }
  | { id: string; role: "error"; text: string };

type Props = {
  onAddProduct: (name: string) => Promise<string>;
  onGoToMyProducts: () => void;
};

export function ChatTab({ onAddProduct, onGoToMyProducts }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      productName: "__welcome__",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || busy) return;
    setInput("");
    if (!isSupportedProductDetailUrl(value)) {
      setMessages((m) => [
        ...m,
        { id: `u-${Date.now()}`, role: "user", text: value },
        { id: `n-${Date.now()}`, role: "notice", text: CHAT_COPY.unsupportedProductUrl },
      ]);
      return;
    }
    setBusy(true);
    const userId = `u-${Date.now()}`;
    const loadingId = `l-${Date.now()}`;
    const stepTimers: ReturnType<typeof setTimeout>[] = [];
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text: value },
      {
        id: loadingId,
        role: "loading",
        activeStep: 0,
      },
    ]);
    CHAT_AGENT_ACTIVITY_LOGS.slice(1).forEach((_, stepIndex) => {
      stepTimers.push(
        setTimeout(
          () => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === loadingId && msg.role === "loading"
                  ? { ...msg, activeStep: stepIndex + 1 }
                  : msg,
              ),
            );
          },
          (stepIndex + 1) * AGENT_STEP_MIN_MS,
        ),
      );
    });
    try {
      const [productName] = await Promise.all([onAddProduct(value), delay(AGENT_MIN_THINKING_MS)]);
      setMessages((m) =>
        m
          .filter((msg) => msg.id !== loadingId)
          .concat({ id: `a-${Date.now()}`, role: "assistant", productName }),
      );
    } catch {
      setMessages((m) =>
        m
          .filter((msg) => msg.id !== loadingId)
          .concat({
            id: `e-${Date.now()}`,
            role: "error",
            text: CHAT_COPY.retryRequested,
          }),
      );
    } finally {
      stepTimers.forEach((timer) => clearTimeout(timer));
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-156px)] min-h-0 flex-col md:h-[calc(100vh-180px)] md:min-h-[500px]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((m) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 shadow-sm">
                  <p className="text-sm leading-relaxed">{m.text}</p>
                </div>
              </div>
            );
          }
          if (m.role === "loading") {
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <Avatar />
                <div className="max-w-[85%] space-y-2">
                  <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
                        <Brain className="h-4 w-4 text-primary" />
                      </span>
                      <span>{CHAT_COPY.analysisTitle}</span>
                    </div>
                  </div>
                  <div className="ml-1 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    <span>
                      <span className="font-medium text-foreground">
                        {CHAT_AGENT_ACTIVITY_LOGS[m.activeStep].label}
                      </span>
                      <span className="block">{CHAT_AGENT_ACTIVITY_LOGS[m.activeStep].detail}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          }
          if (m.role === "error") {
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <Avatar />
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-destructive/10 border border-destructive/20 px-4 py-3 shadow-sm">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-destructive">
                    {m.text}
                  </p>
                </div>
              </div>
            );
          }
          if (m.role === "notice") {
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <Avatar />
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm">
                  <p className="text-sm leading-relaxed text-muted-foreground">{m.text}</p>
                </div>
              </div>
            );
          }
          // assistant
          if (m.productName === "__welcome__") {
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <Avatar />
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm">
                  <p className="text-sm leading-relaxed">
                    {CHAT_COPY.welcome.intro} <strong>{CHAT_COPY.welcome.assistantName}</strong>
                    {CHAT_COPY.welcome.suffix}
                    <br />
                    <br />
                    {CHAT_COPY.welcome.instruction}
                    <br />
                    {CHAT_COPY.welcome.promise}
                    <br />
                    {CHAT_COPY.welcome.supportedMarket}
                  </p>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex justify-start gap-2">
              <Avatar />
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-3 shadow-sm space-y-3">
                <p className="text-sm leading-relaxed">
                  <strong>{m.productName}</strong> {CHAT_COPY.completion.registeredSuffix}
                  <br />
                  <br />
                  <span className="text-muted-foreground">
                    {CHAT_COPY.completion.trackingPromise}
                  </span>
                </p>
                <Button size="sm" onClick={onGoToMyProducts} className="rounded-full text-xs h-8">
                  {CHAT_COPY.completion.action} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-card/60 backdrop-blur p-3 flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={CHAT_COPY.input.placeholder}
          disabled={busy}
          className="rounded-full bg-background border-border h-11 px-4 text-sm"
        />
        <Button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full h-11 w-11 p-0 shrink-0"
          aria-label={CHAT_COPY.input.submitLabel}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Avatar() {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-accent flex items-center justify-center shadow-sm">
      <ShoppingBag className="h-4 w-4 text-accent-foreground" />
    </div>
  );
}
