import { githubCallbackResponse } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => githubCallbackResponse(request, "login");
