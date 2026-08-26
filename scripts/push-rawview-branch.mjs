import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const owner = "Tony-hnv";
const repo = "rawviewer";
const branch = "rawview-mobile";
const token = process.env.GH_TOKEN;

if (!token) {
  throw new Error("GitHub authorization is unavailable for the branch upload.");
}

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${detail}`);
  }

  return response.status === 204 ? null : response.json();
}

function trackedFiles() {
  const rawIndex = execFileSync("git", ["ls-files", "-s", "-z"], { encoding: "utf8" });
  return rawIndex
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const [metadata, filePath] = entry.split("\t");
      const [mode] = metadata.split(" ");
      return { filePath, mode };
    });
}

const mainRef = await api(`/repos/${owner}/${repo}/git/ref/heads/main`);
const files = trackedFiles();
const tree = [];

for (const file of files) {
  const content = readFileSync(file.filePath).toString("base64");
  const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, encoding: "base64" }),
  });
  tree.push({ path: file.filePath, mode: file.mode, type: "blob", sha: blob.sha });
}

const createdTree = await api(`/repos/${owner}/${repo}/git/trees`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tree }),
});

const commit = await api(`/repos/${owner}/${repo}/git/commits`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "chore: import RAW View Expo project",
    tree: createdTree.sha,
    parents: [mainRef.object.sha],
  }),
});

try {
  await api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
} catch (error) {
  if (!String(error.message).includes("404")) throw error;
  await api(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  });
}

console.log(`https://github.com/${owner}/${repo}/tree/${branch}`);
