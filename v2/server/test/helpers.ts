import { randomUUID } from "node:crypto";
import { createApp } from "../app.js";

const app = createApp();

/** A signed-in test user that keeps its session cookie between requests. */
export class TestUser {
  cookie = "";
  constructor(public email: string, public name: string) {}

  static async create(name = "Dad") {
    const user = new TestUser(`${name.toLowerCase()}-${randomUUID().slice(0, 8)}@test.dev`, name);
    const res = await user.req("POST", "/auth/dev", { email: user.email, name });
    if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
    return user;
  }

  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.request(path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    const session = setCookie?.match(/dl_session=([^;]*)/);
    if (session) this.cookie = session[1] ? `dl_session=${session[1]}` : "";
    return res;
  }

  async json<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await this.req(method, path, body);
    return { status: res.status, data: (await res.json()) as T };
  }
}

export const anonymous = (method: string, path: string, init: RequestInit = {}) => app.request(path, { method, ...init });

export async function leagueWith(owner: TestUser, ...members: TestUser[]) {
  const { data } = await owner.json("POST", "/api/leagues", { name: "Test League", description: "for tests" });
  for (const m of members) await m.json("POST", "/api/leagues/join", { code: data.league.inviteCode });
  return data.league as { id: string; inviteCode: string };
}
