export function subscriptionRequestOrigin(request: Request): string | undefined {
	try {
		const url = new URL(request.url);
		const host = request.headers.get("host") ?? url.host;
		const addressed = new URL(`${url.protocol}//${host}`);
		if (!["http:", "https:"].includes(addressed.protocol) || addressed.username || addressed.password || addressed.pathname !== "/" || addressed.search || addressed.hash) return;
		return addressed.origin;
	} catch { return; }
}
