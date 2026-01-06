"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport, isTextUIPart, type UIMessage } from "ai";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export const ChatWithChain = memo(function ChatWithChain({ api = "/api/ai" }: { api?: string }) {
  const transport = useMemo(() => new TextStreamChatTransport({ api }), [api]);
  const { messages, sendMessage, status, error, clearError } = useChat({ transport });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const isLoading = status === "submitted" || status === "streaming";

  const helpPrompts = useMemo(
    () => [
      "给我当前 DeFi 信号的总览。",
      "目前 TVL 领先的是哪个协议？",
      "为什么 Aave 显示为降级？",
      "对比 Uniswap 和 Compound 的动量。",
    ],
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLoading]);

  const onSubmit = useCallback(
    async (e?: { preventDefault?: () => void }) => {
      e?.preventDefault?.();
      const text = input.trim();
      if (!text) return;
      clearError();
      setInput("");
      await sendMessage({ text });
    },
    [input, sendMessage, clearError],
  );

  const renderMessageText = useCallback((m: UIMessage) => {
    return m.parts
      .filter(isTextUIPart)
      .map((p) => p.text)
      .join("");
  }, []);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">链上洞察助手</div>
        <Badge variant="secondary">Vercel AI SDK（流式）</Badge>
      </div>

      <ScrollArea className="h-[360px] rounded-md border bg-muted/20">
        <div className="space-y-3 p-3">
          {messages.length === 0 ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>可以直接问 DeFi 数据；助手会基于聚合结果返回结构化报告。</div>
              <div className="flex flex-wrap gap-2">
                {helpPrompts.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void sendMessage({ text: p })}
                  >
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) => (
            <div key={m.id} className="rounded-md border bg-background/70 p-3">
              <div className="mb-1 text-xs text-muted-foreground">
                {m.role === "user" ? "我" : m.role === "assistant" ? "助手" : m.role === "system" ? "系统" : m.role}
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-6">{renderMessageText(m)}</pre>
            </div>
          ))}

          {error ? (
            <div className="rounded-md border bg-background p-3 text-sm text-destructive">
              AI 出错：{String(error.message ?? error)}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="可以问：TVL、成交量、协议健康度..."
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || input.trim().length === 0}>
          {isLoading ? "思考中..." : "发送"}
        </Button>
      </form>
    </Card>
  );
});
