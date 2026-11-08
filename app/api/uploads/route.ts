import { uploadResponse, uploadsStatusResponse } from "@/src/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return uploadResponse(request); }
export async function GET(request: Request) { return uploadsStatusResponse(request); }
