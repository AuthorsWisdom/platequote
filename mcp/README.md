# PlateQuote MCP stub

`node mcp/server.mjs` speaks a small slice of MCP over stdio. It lists two tools and refuses to run them.

- `get_quote` is planned to accept a file URL or a description, plus material and quantity, and return a pricing-engine quote.
- `create_checkout` is planned to return a PayPal approval link. A person approves the payment. The tool must not capture on its own.

Neither tool calls the slicer or PayPal in this build. The working quote and checkout paths are the web app.
