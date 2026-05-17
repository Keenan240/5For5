import { runCreateParlay } from "@/lib/create-parlay";
import type { CreateProgressEvent } from "@/lib/discovery-progress";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sseLine(event: CreateProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CreateProgressEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      try {
        await runCreateParlay(send);
      } catch (err) {
        console.error("Create parlay stream error:", err);
        send({
          type: "error",
          error: "Failed to create parlay. Check server logs.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
