import { getAuth } from "@/auth/server";
import { toNextJsHandler } from "better-auth/next-js";

export async function GET(request: Request) {
	return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
	return toNextJsHandler(getAuth()).POST(request);
}
