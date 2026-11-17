import { getChat, readLastLesson, writeLastLesson } from "@/src/server";

export function GET() {
	const id = readLastLesson();
	return Response.json({ chatId: id && getChat(id) ? id : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(req: Request) {
	const body = await req.json().catch(() => null);
	if (typeof body?.chatId !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.chatId)) return Response.json({ error: "Invalid lesson" }, { status: 400 });
	if (!getChat(body.chatId)) return Response.json({ error: "Not found" }, { status: 404 });
	writeLastLesson(body.chatId);
	return Response.json({ ok: true });
}
