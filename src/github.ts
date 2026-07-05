/**
 * Minimal GitHub issue fetcher. Public repos need no token;
 * GITHUB_TOKEN raises the rate limit from 60/hr to 5000/hr.
 */

export type Issue = {
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  labels: string[];
};

const ISSUE_URL_RE =
  /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;

export function parseIssueUrl(url: string): {
  owner: string;
  repo: string;
  number: number;
} {
  const m = ISSUE_URL_RE.exec(url);
  if (!m || !m[1] || !m[2] || !m[3]) {
    throw new Error(
      `Not a GitHub issue URL: ${url}\nExpected https://github.com/<owner>/<repo>/issues/<number>`,
    );
  }
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

export async function fetchIssue(url: string): Promise<Issue> {
  const { owner, repo, number } = parseIssueUrl(url);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "issuegraph",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${owner}/${repo}#${number}`);
  }

  const data = (await res.json()) as {
    title: string;
    body: string | null;
    labels: Array<{ name: string }>;
    pull_request?: unknown;
  };
  if (data.pull_request) {
    throw new Error(`${owner}/${repo}#${number} is a pull request, not an issue`);
  }

  return {
    url,
    owner,
    repo,
    number,
    title: data.title,
    // Bound the body so one pathological issue can't blow the context window.
    body: (data.body ?? "").slice(0, 8000),
    labels: data.labels.map((l) => l.name),
  };
}
