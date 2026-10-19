import {
  parseCreateParlayRequest,
  runCreateParlay,
} from "@/lib/create-parlay";
import type { CreateProgressEvent } from "@/lib/discovery-progress";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sseLine(event: CreateProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const options = await parseCreateParlayRequest(request);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: CreateProgressEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      try {
        await runCreateParlay(send, undefined, options);
      } catch (err) {
        console.error("Create parlay stream error:", err);
        const detail =
          err instanceof Error ? err.message : "Unknown create error";
        send({
          type: "error",
          error: `Failed to create parlay: ${detail}`,
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
