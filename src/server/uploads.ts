import { mkdir, mkdtemp, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { PATHS } from "../../config.ts";
import { MAX_UPLOAD_BYTES } from "../../lib/upload-limits.ts";
import { desktopAPIAuthorized } from "./desktop-access.ts";
import { subscriptionRequestOrigin } from "./web-subscription-http.ts";

const state = globalThis as typeof globalThis & { lhActiveUploads?: number };
export function activeUploads() { return state.lhActiveUploads ?? 0; }
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function error(message: string, status: number) { return Response.json({ error: message }, { status, headers }); }

export function uploadsStatusResponse(request: Request) {
	if (!desktopAPIAuthorized(request.headers)) return error("Desktop API access requires the trusted LearnHarness window.", 403);
	return Response.json({ enabled: process.env.LH_SHARED_SERVER === "1", active: activeUploads() }, { headers });
}

/** One raw file per request. Bound streamed bytes, keep private partials, and
 * publish a reference only after closing and atomically renaming the file.
 * Same-origin protection complements the deployment's private network gate. */
export async function uploadResponse(request: Request, root = path.join(PATHS.data, "uploads")): Promise<Response> {
	if (!desktopAPIAuthorized(request.headers)) return error("Desktop API access requires the trusted LearnHarness window.", 403);
	if (process.env.LH_SHARED_SERVER !== "1") return error("Uploads are unavailable on this server.", 404);
	const origin = subscriptionRequestOrigin(request);
	if (!origin || request.headers.get("origin") !== origin || request.headers.get("x-learnharness-upload") !== "1" || request.headers.get("sec-fetch-site") === "cross-site") return error("Upload files from LearnHarness.", 403);
	let name: string;
	try { name = decodeURIComponent(request.headers.get("x-file-name") ?? ""); } catch { return error("Invalid filename.", 400); }
	if (!name || name === "." || name === ".." || name === ".partial" || /[/\\\x00-\x1f\x7f]/.test(name) || Buffer.byteLength(name) > 240) return error("Invalid filename.", 400);
	if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) return error("Files must be 50 MB or smaller.", 413);
	if (!request.body && request.headers.get("content-length") !== "0") return error("Expected a file.", 400);
	const reader = (request.body ?? new Blob([]).stream()).getReader();
	state.lhActiveUploads = activeUploads() + 1;
	let directory: string | undefined;
	let completed = false;
	try {
		await mkdir(root, { recursive: true, mode: 0o700 });
		directory = await mkdtemp(path.join(root, "file-"));
		const temporary = path.join(directory, ".partial");
		const file = await open(temporary, "wx", 0o600);
		let size = 0;
		try {
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				size += chunk.value.byteLength;
				if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); return error("Files must be 50 MB or smaller.", 413); }
				await file.writeFile(chunk.value);
			}
			await file.sync();
		} finally { await file.close(); }
		const destination = path.join(directory, name);
		await rename(temporary, destination);
		completed = true;
		return Response.json({ path: destination, name, size }, { status: 201, headers });
	} catch {
		return error("The file could not be uploaded. Try again.", 500);
	} finally {
		reader.releaseLock();
		try { if (directory && !completed) await rm(directory, { recursive: true, force: true }); }
		finally { state.lhActiveUploads = activeUploads() - 1; }
	}
}
