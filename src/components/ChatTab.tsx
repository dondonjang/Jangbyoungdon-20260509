import { useEffect, useRef, useState } from "react";
import { Send, ArrowRight, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "loading"; text: string }
  | { id: string; role: "assistant"; productName: string }
  | { id: string; role: "error"; text: string };

type Props = {
  onAddProduct: (name: string) => Promise<void>;
  onGoToAnalysis: () => void;
};

export function ChatTab({ onAddProduct, onGoToAnalysis }: Props) {
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
    setBusy(true);
    const userId = `u-${Date.now()}`;
    const loadingId = `l-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text: value },
      {
        id: loadingId,
        role: "loading",
        text: "상품을 분석하고 자주 사는 상품에 저장하고 있어요...",
      },
    ]);
    try {
      await onAddProduct(value);
      setMessages((m) =>
        m
          .filter((msg) => msg.id !== loadingId)
          .concat({ id: `a-${Date.now()}`, role: "assistant", productName: value }),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "상품 분석 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.";
      setMessages((m) =>
        m
          .filter((msg) => msg.id !== loadingId)
          .concat({
            id: `e-${Date.now()}`,
            role: "error",
            text: message,
          }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
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
                <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-card border border-border px-4 py-2.5 shadow-sm">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </span>
                    {m.text}
                  </p>
                </div>
              </div>
            );
          }
          if (m.role === "error") {
            return (
              <div key={m.id} className="flex justify-start gap-2">
                <Avatar />
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-destructive/10 border border-destructive/20 px-4 py-3 shadow-sm">
                  <p className="text-sm leading-relaxed text-destructive">{m.text}</p>
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
                    안녕하세요! 저는 <strong>장바구니 비서</strong>예요 🛍️
                    <br />
                    <br />
                    상품명이나 상품 링크를 보내주시면 분석해서 자주 사는 상품에 저장해둘게요.
                    <br />
                    항상 더 잘 살수 있도록 도와드립니다.
                    <br />
                    (현재는 마켓컬리만 지원을 하고 있어요)
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
                  ✅ <strong>{m.productName}</strong> 분석 완료!
                  <br />
                  <span className="text-muted-foreground">
                    자주 사는 상품 탭에서 결과를 확인하세요
                  </span>
                </p>
                <Button size="sm" onClick={onGoToAnalysis} className="rounded-full text-xs h-8">
                  결과 보기 <ArrowRight className="h-3 w-3 ml-1" />
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
          placeholder="상품명 또는 상품 링크를 입력하세요"
          disabled={busy}
          className="rounded-full bg-background border-border h-11 px-4 text-sm"
        />
        <Button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full h-11 w-11 p-0 shrink-0"
          aria-label="전송"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function Avatar() {
  return (
    <div className="h-8 w-8 shrink-0 rounded-full bg-accent flex items-center justify-center shadow-sm">
      <ShoppingBag className="h-4 w-4 text-accent-foreground" />
    </div>
  );
}
