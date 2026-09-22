import { execSync } from 'child_process';

// Pattern quét secret phổ biến. Giữ ở mức precision cao để tránh false-positive.
export const SECRET_PATTERNS = [
  { id: 'npm-token', label: 'npm Access Token', regex: /npm_[A-Za-z0-9]{8,}/ },
  { id: 'npm-authtoken', label: '_authToken trong .npmrc', regex: /_authToken\s*=\s*\S+/i },
  { id: 'github-token', label: 'GitHub Token (ghp_/gho_/github_pat_)', regex: /\b(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { id: 'aws-key', label: 'AWS Access Key (AKIA...)', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'aws-secret', label: 'AWS Secret Key', regex: /aws_secret_access_key\s*=\s*\S+/i },
  { id: 'private-key', label: 'Private Key (PEM)', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { id: 'openai-key', label: 'OpenAI API Key', regex: /\bsk-(proj-)?[A-Za-z0-9_-]{20,}\b/ },
  { id: 'slack-token', label: 'Slack Token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-key', label: 'Google API Key', regex: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
  { id: 'generic-password', label: 'Password gán cứng', regex: /\b(password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i },
];

const SKIP_DIRS = ['node_modules/', '.git/', 'dist/', 'build/', '.next/'];
const SKIP_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
const MAX_FILE_BYTES = 512 * 1024; // bỏ qua file staged > 512KB
const MAX_MATCHES_PER_FILE = 3;

function listStagedFiles(cwd) {
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
      cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore']
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readStagedContent(file, cwd) {
  try {
    // Đọc nội dung đã stage (git show :path), không phải file ngoài disk
    const content = execSync(`git show :"${file.replace(/"/g, '')}"`, {
      cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: MAX_FILE_BYTES * 2
    });
    if (content.length > MAX_FILE_BYTES) return null; // file quá lớn, bỏ qua
    if (content.includes('\0')) return null; // file binary
    return content;
  } catch {
    return null;
  }
}

function redactPreview(line) {
  const s = line.trim().slice(0, 120);
  // Che giữa secret, chỉ chừa 4 ký tự đầu/cuối
  return s.replace(/([A-Za-z0-9_.-]{4})[A-Za-z0-9_.-]{6,}([A-Za-z0-9_.-]{2})?/g, '$1•••$2');
}

/**
 * Quét nội dung các file đã stage để tìm secret.
 * @param {string} cwd
 * @returns {{ file: string, type: string, line: number, preview: string }[]}
 */
export function scanStagedContentForSecrets(cwd = process.cwd()) {
  const findings = [];
  const files = listStagedFiles(cwd).filter((f) => {
    if (SKIP_DIRS.some((d) => f.startsWith(d))) return false;
    if (SKIP_FILES.includes(f.split('/').pop())) return false;
    return true;
  });

  for (const file of files.slice(0, 100)) { // giới hạn 100 file để nhanh
    const content = readStagedContent(file, cwd);
    if (!content) continue;
    const lines = content.split('\n');
    let matchesInFile = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.length > 2000) continue;
      // Bỏ qua comment ví dụ trong docs? vẫn báo để user tự quyết
      for (const p of SECRET_PATTERNS) {
        if (p.regex.test(line)) {
          findings.push({ file, type: p.label, line: i + 1, preview: redactPreview(line) });
          matchesInFile++;
          break; // mỗi dòng chỉ báo 1 lần
        }
      }
      if (matchesInFile >= MAX_MATCHES_PER_FILE) break;
      if (findings.length >= 20) return findings; // chặn spam
    }
  }
  return findings;
}
