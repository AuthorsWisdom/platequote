#!/usr/bin/env node
/**
 * PlateQuote MCP stub.
 *
 * TODO: get_quote should call the same slicing and pricing path as POST /api/quotes.
 * TODO: create_checkout should create a PayPal sandbox order and return its approval
 * URL so a person always approves the payment. It must not capture by itself.
 *
 * This process only advertises the tools and refuses to run them.
 */

import readline from "node:readline";

const tools = [
  {
    name: "get_quote",
    description:
      "Quote an STL or 3MF from a file URL or a short description. Not implemented in this milestone.",
    inputSchema: {
      type: "object",
      properties: {
        file_url: { type: "string" },
        description: { type: "string" },
        material: { type: "string" },
        qty: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    name: "create_checkout",
    description:
      "Return a PayPal approval link for a quote. A human approves the payment. Not implemented in this milestone.",
    inputSchema: {
      type: "object",
      properties: {
        quote_id: { type: "string" },
      },
      required: ["quote_id"],
    },
  },
];

function respond(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function fail(id, message) {
  process.stdout.write(
    `${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`,
  );
}

const lines = readline.createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = message;
  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "platequote", version: "0.1.0" },
    });
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    respond(id, { tools });
    return;
  }
  if (method === "tools/call") {
    const name = params?.name;
    respond(id, {
      isError: true,
      content: [
        {
          type: "text",
          text:
            name === "create_checkout"
              ? "TODO: create_checkout will return a PayPal approval URL. A human approves. This milestone does not create one."
              : "TODO: get_quote will slice a file and return the pricing-engine total. Use the web quote page for this milestone.",
        },
      ],
    });
    return;
  }
  if (id !== undefined) fail(id, `Unknown method ${method}`);
});
