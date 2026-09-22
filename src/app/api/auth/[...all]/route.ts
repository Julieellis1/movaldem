import { auth } from "@/modules/auth/auth.config";

// better-auth's handler is a single (request) => Response function; the App
// Router wants named exports, so adapt it here.
export async function GET(request: Request) {
  return auth.handler(request);
}
export async function POST(request: Request) {
  return auth.handler(request);
}
