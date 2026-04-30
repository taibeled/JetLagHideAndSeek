.PHONY: tailscale_serve tailscale_serve_reset

TAILSCALE_PORT ?= 8787

tailscale_serve:
	@command -v tailscale >/dev/null 2>&1 || { echo "tailscale CLI not found. Install Tailscale first."; exit 1; }
	@tailscale status >/dev/null 2>&1 || { echo "Tailscale is not connected. Run 'tailscale up' first."; exit 1; }
	@command -v pnpm >/dev/null 2>&1 || { echo "pnpm not found. Install pnpm first."; exit 1; }
	@echo "Configuring Tailscale HTTPS serve for localhost:$(TAILSCALE_PORT)..."
	@tailscale serve --bg $(TAILSCALE_PORT)
	@echo "Starting app stack on localhost:$(TAILSCALE_PORT)..."
	@pnpm start:app

tailscale_serve_reset:
	@command -v tailscale >/dev/null 2>&1 || { echo "tailscale CLI not found. Install Tailscale first."; exit 1; }
	@echo "Resetting Tailscale serve/funnel configuration..."
	@tailscale serve reset
