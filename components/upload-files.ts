import { MAX_UPLOAD_BYTES } from "../lib/upload-limits.ts";

/** Retain successful uploads when another file fails. Uploads are never sent
 * as a lesson turn automatically. The caller owns the captured draft target. */
export async function uploadFiles(files: File[]): Promise<{ paths: string[]; errors: string[] }> {
	const paths: string[] = [];
	const errors: string[] = [];
	for (const file of files) {
		if (file.size > MAX_UPLOAD_BYTES) { errors.push(`${file.name}: files must be 50 MB or smaller.`); continue; }
		try {
			const response = await fetch("/api/uploads", {
				method: "POST", headers: { "x-learnharness-upload": "1", "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" }, body: file,
			});
			const result = await response.json();
			if (!response.ok || typeof result.path !== "string") throw new Error(result.error || "Upload failed.");
			paths.push(result.path);
		} catch (error) { errors.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`); }
	}
	return { paths, errors };
}
