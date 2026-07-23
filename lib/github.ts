/**
 * Import a GitHub user's public repositories as project cards. Given a profile
 * URL (or bare username), fetch their repos via the public GitHub API and shape
 * each into the fields the Project model needs. No auth token required for
 * public repos (rate-limited to 60 req/hr/IP, which is plenty for one import).
 */

export type RepoProject = {
  name: string;
  blurb: string;
  githubUrl: string;
  liveUrl: string | null;
  stars: number;
};

/** Pull the username out of a github.com profile URL, or accept a bare handle. */
export function githubUsername(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // github.com/<user>  (optionally with protocol / trailing path)
  const m = s.match(/github\.com\/([A-Za-z0-9-]+)/i);
  if (m) return m[1];
  // Bare username (no slashes, valid handle chars).
  if (/^[A-Za-z0-9-]+$/.test(s)) return s;
  return null;
}

type GhRepo = {
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  fork: boolean;
  archived: boolean;
  stargazers_count: number;
};

/**
 * Fetch a user's public, non-fork, non-archived repos, most-starred first,
 * capped at `limit`. Throws with a clear message on a bad user / rate limit.
 */
export async function fetchGithubProjects(
  usernameOrUrl: string,
  limit = 12,
): Promise<RepoProject[]> {
  const user = githubUsername(usernameOrUrl);
  if (!user) throw new Error("Couldn't read a GitHub username from that link.");

  const res = await fetch(
    `https://api.github.com/users/${user}/repos?per_page=100&sort=updated`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "blake-personal-site",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (res.status === 404) throw new Error(`No GitHub user "${user}".`);
  if (res.status === 403) throw new Error("GitHub rate limit hit — try again in a bit.");
  if (!res.ok) throw new Error(`GitHub request failed: ${res.status}`);

  const repos = (await res.json()) as GhRepo[];
  if (!Array.isArray(repos)) return [];

  return repos
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, limit)
    .map((r) => ({
      name: r.name,
      blurb: (r.description ?? "").trim() || `${r.name} — a project on GitHub.`,
      githubUrl: r.html_url,
      liveUrl: r.homepage && r.homepage.trim() ? r.homepage.trim() : null,
      stars: r.stargazers_count,
    }));
}
