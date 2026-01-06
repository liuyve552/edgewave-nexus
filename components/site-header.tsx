import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">
            EdgeWave Nexus
          </Link>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            ESA 边缘 / Web3 / AI
          </Badge>
        </div>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/demo">对比演示</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="#galaxy">星系</a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href="#ai">AI</a>
          </Button>
        </nav>
      </div>
    </header>
  );
}

