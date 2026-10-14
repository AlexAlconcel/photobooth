/**
 * Optional local print bridge for a computer that is physically attached
 * to a thermal printer. This process is NOT deployed to Vercel.
 *
 * Run only on 127.0.0.1. Extend handlePrint() with a vendor SDK or
 * ESC/POS adapter after the printer model is known.
 *
 *   node print-bridge/server.mjs
 */
import http from "node:http";

const PORT = 4173;
const MAX_BYTES = 5_000_000;

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "http://localhost:3000",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(body);
}

function handlePrint() {
  return {
    ok: false,
    message: "No printer adapter is configured on this bridge. Add the vendor SDK or ESC/POS routine for your exact thermal printer before sending jobs.",
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    json(response, 204, { ok: true });
    return;
  }
  const host = request.headers.host || "";
  if (!host.startsWith("127.0.0.1") && !host.startsWith("localhost")) {
    json(response, 403, { ok: false, message: "The print bridge only accepts local requests." });
    return;
  }

  if (request.url === "/health" && request.method === "GET") {
    json(response, 200, { ok: true, printer: null });
    return;
  }

  if (request.url === "/print" && request.method === "POST") {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BYTES) {
        json(response, 413, { ok: false, message: "Print payload is too large." });
        return;
      }
      chunks.push(chunk);
    }
    try {
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const copies = Number(payload.copies);
      if (!Number.isInteger(copies) || copies < 1 || copies > 10) {
        json(response, 400, { ok: false, message: "Copies must be a whole number from 1 to 10." });
        return;
      }
      json(response, 501, handlePrint());
    } catch {
      json(response, 400, { ok: false, message: "Invalid print JSON." });
    }
    return;
  }

  json(response, 404, { ok: false, message: "Unknown bridge route." });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`KixClicks print bridge listening on http://127.0.0.1:${PORT}`);
});
