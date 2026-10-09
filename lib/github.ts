import "server-only";
import { env } from "@/lib/env";
import { claimDecision } from "@/lib/identity";

const API = "https://api.github.com";

export type GithubRepo = {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  pushed_at: string;
  created_at: string;
  size: number;
  owner: { login: string; id: number };
  permissions?: { admin: boolean; push: boolean; pull: boolean };
};

export class GithubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function gh<T>(path: string, token = env.githubToken): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new GithubError(`GitHub ${res.status} ${path}`, res.status);
  return res.json() as Promise<T>;
}

/** Kullanıcının erişebildiği public repolar (kendi + ortak çalışan + organizasyon). */
export async function listPublicRepos(userToken: string | undefined, login: string) {
  if (userToken) {
    try {
      const repos = await gh<GithubRepo[]>(
        "/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100",
        userToken,
      );
      return repos.filter((r) => !r.private);
    } catch (e) {
      if (!(e instanceof GithubError && e.status === 401)) throw e;
    }
  }
  // Kullanıcı token'ı yoksa: yalnızca kendi public repoları
  const repos = await gh<GithubRepo[]>(`/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=100`);
  return repos.filter((r) => !r.private);
}

export function parseRepoInput(input: string): string | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)/i) ?? s.match(/^([\w.-]+)\/([\w.-]+)$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function getRepo(fullName: string, userToken?: string) {
  return gh<GithubRepo>(`/repos/${fullName}`, userToken ?? env.githubToken);
}

export async function getRepoById(id: number) {
  return gh<GithubRepo>(`/repositories/${id}`);
}

/**
 * Kullanıcı bu repoyu içe aktarabilir mi? Başka bir ekibin reposunu sahiplenmeyi engeller (denetim A02).
 * Repo sahibi sabit GitHub kimliğiyle eşleşiyorsa izin verilir; değilse kullanıcının kendi token'ı gerekir:
 * token'ın sahibi oturumdaki kişi olmalı ve GitHub repoya push yetkisi göstermeli. Kullanıcı adına güvenilmez.
 */
export async function canClaimRepo(repo: GithubRepo, githubId: string, userToken?: string) {
  const first = claimDecision({ ownerId: repo.owner.id, githubId });
  if (first === "owner") return first;
  if (!userToken) return "token-required" as const;
  try {
    const [me, asUser] = await Promise.all([gh<{ id: number }>("/user", userToken), getRepo(repo.full_name, userToken)]);
    return claimDecision({ ownerId: repo.owner.id, githubId, tokenUserId: me.id, tokenCanPush: !!asUser.permissions?.push });
  } catch (e) {
    if (e instanceof GithubError && e.status === 401) return "token-required" as const;
    return "denied" as const;
  }
}

export async function downloadZipball(fullName: string, sha: string) {
  const res = await fetch(`${API}/repos/${fullName}/zipball/${sha}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {}),
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new GithubError(`Arşiv indirilemedi (${res.status})`, res.status);
  if (Number(res.headers.get("content-length") ?? 0) > 50 * 1024 * 1024) {
    await res.body?.cancel();
    throw new Error("Arşiv 50 MB sınırını aşıyor.");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Arşiv yanıtı boş.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 50 * 1024 * 1024) { await reader.cancel(); throw new Error("Arşiv 50 MB sınırını aşıyor."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const zip = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { zip.set(chunk, offset); offset += chunk.byteLength; }
  return zip;
}

/** Varsayılan dalın son commit'i; dal boşsa null. */
export async function getHeadSha(repo: GithubRepo) {
  try {
    const head = await gh<{ sha: string }>(`/repos/${repo.full_name}/commits/${encodeURIComponent(repo.default_branch)}`);
    return head.sha;
  } catch (e) {
    if (e instanceof GithubError && (e.status === 409 || e.status === 404)) return null;
    throw e;
  }
}

/** Başlangıçtan önce tarihlenmiş commit var mı? Commit tarihi değiştirilebildiği için yalnızca işarettir. */
export async function hasCommitsBefore(repo: GithubRepo, iso: string) {
  try {
    const list = await gh<unknown[]>(`/repos/${repo.full_name}/commits?until=${encodeURIComponent(iso)}&per_page=1`);
    return list.length > 0;
  } catch (e) {
    if (e instanceof GithubError && e.status === 409) return false;
    throw e;
  }
}
