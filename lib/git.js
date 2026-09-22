import { execSync, spawnSync } from 'child_process';
import path from 'path';

/**
 * Kiểm tra xem máy tính đã cài đặt Git hay chưa
 * @returns {boolean}
 */
export function checkGitInstalled() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kiểm tra thư mục hiện tại đã là kho chứa Git (Git repo) chưa
 * @param {string} cwd 
 * @returns {boolean}
 */
export function isGitRepo(cwd = process.cwd()) {
  try {
    const output = execSync('git rev-parse --is-inside-work-tree', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Khởi tạo Git repo trong thư mục hiện tại
 * @param {string} cwd 
 */
export function initGitRepo(cwd = process.cwd()) {
  execSync('git init', { cwd, stdio: 'pipe' });
}

/**
 * Lấy tên branch hiện tại (hoặc mặc định là main)
 * @param {string} cwd 
 * @returns {string}
 */
export function getCurrentBranch(cwd = process.cwd()) {
  try {
    const branch = execSync('git branch --show-current', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return branch || 'main';
  } catch {
    return 'main';
  }
}

/**
 * Thiết lập tên branch chính (ví dụ: git branch -M main)
 * @param {string} branchName 
 * @param {string} cwd 
 */
export function setBranchName(branchName = 'main', cwd = process.cwd()) {
  try {
    execSync(`git branch -M "${branchName}"`, { cwd, stdio: 'pipe' });
  } catch (err) {
    // Nếu chưa có commit nào, command này có thể báo lỗi nhưng không sao
  }
}

/**
 * Cấu hình remote `origin` cho Git repo
 * @param {string} repoUrl 
 * @param {string} cwd 
 */
export function setGitRemote(repoUrl, cwd = process.cwd()) {
  try {
    const remotes = execSync('git remote', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (remotes.includes('origin')) {
      execSync(`git remote set-url origin "${repoUrl}"`, { cwd, stdio: 'pipe' });
    } else {
      execSync(`git remote add origin "${repoUrl}"`, { cwd, stdio: 'pipe' });
    }
  } catch (error) {
    throw new Error(`Không thể thiết lập Git Remote URL: ${error.message}`);
  }
}

/**
 * Stage toàn bộ file trong thư mục
 * @param {string} cwd 
 */
export function stageAllFiles(cwd = process.cwd()) {
  execSync('git add .', { cwd, stdio: 'pipe' });
}

/**
 * Kiểm tra xem có thay đổi (staged hoặc unstaged) chưa commit hay không
 * @param {string} cwd 
 * @returns {boolean}
 */
export function hasChangesToCommit(cwd = process.cwd()) {
  try {
    const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return status.trim().length > 0;
  } catch {
    return true;
  }
}

/**
 * Thực hiện Git commit với thời gian tùy chỉnh (sử dụng GIT_AUTHOR_DATE & GIT_COMMITTER_DATE)
 * @param {string} message 
 * @param {string} dateFormatted ISO hoặc Git date format
 * @param {string} cwd 
 */
export function commitWithCustomDate(message, dateFormatted, cwd = process.cwd()) {
  const env = {
    ...process.env,
    GIT_AUTHOR_DATE: dateFormatted,
    GIT_COMMITTER_DATE: dateFormatted
  };

  const result = spawnSync('git', ['commit', '-m', message], {
    cwd,
    env,
    encoding: 'utf-8'
  });

  if (result.status !== 0) {
    const stderr = result.stderr || result.stdout || 'Lỗi không xác định khi commit';
    throw new Error(`Git commit thất bại: ${stderr.trim()}`);
  }
}

/**
 * Đẩy code lên Git remote repo
 * @param {string} branch Tên branch (VD: main)
 * @param {boolean} force Có sử dụng --force hay không
 * @param {string} cwd
 */
export function pushToRemote(branch = 'main', force = false, cwd = process.cwd()) {
  const args = ['push', '-u', 'origin', branch];
  if (force) {
    args.push('--force');
  }

  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe'
  });

  if (result.status !== 0) {
    const raw = (result.stderr || result.stdout || 'Lỗi không xác định khi git push').trim();
    const parsed = parsePushError(raw);
    const err = new Error(raw);
    err.code = parsed.code;
    err.details = parsed;
    throw err;
  }
}

/**
 * Phân loại lỗi khi `git push` thất bại để CLI hiển thị hướng dẫn thân thiện.
 * Đặc biệt xử lý GitHub Push Protection (GH013) khi push dính secret.
 *
 * @param {string} rawOutput stderr/stdout từ git push
 * @returns {{ code: string, secretTypes: string[], files: string[], unblockUrl: string | null, resolveUrl: string | null }}
 */
export function parsePushError(rawOutput = '') {
  const text = String(rawOutput || '');
  const lower = text.toLowerCase();

  const isSecretBlocked =
    /gh0?13/.test(text) ||
    lower.includes('push protection') ||
    lower.includes('push cannot contain secrets') ||
    lower.includes('secret scanning') ||
    lower.includes('repository rule violations') ||
    (lower.includes('blocked') && lower.includes('secret')) ||
    (lower.includes('detected') && lower.includes('secret'));

  if (isSecretBlocked) {
    // VD: "—— npm Access Token ——" hoặc "— Generic API Key —"
    const secretTypes = [];
    const typeRegex = /[—\-]{2,}\s*([A-Za-z0-9 _.'()/+-]+?(?:token|key|secret|password|private key)[A-Za-z0-9 _.'()/+-]*?)\s*[—\-]{2,}/gi;
    let m;
    while ((m = typeRegex.exec(text)) !== null) {
      const name = m[1].trim();
      if (name && !secretTypes.includes(name)) secretTypes.push(name);
    }

    // VD: "- commit abc123: .npmrc:1" hoặc "file: .env"
    const files = [];
    const fileRegex = /(?:commit\s+[0-9a-f]{4,40}\s*:\s*)([^\s:]+\.[A-Za-z0-9_.-]+)/gi;
    while ((m = fileRegex.exec(text)) !== null) {
      if (!files.includes(m[1])) files.push(m[1]);
    }
    // fallback: tìm tên file khả nghi trong output
    const fallbackRegex = /(^|\s)(`?\.?(env|npmrc|id_rsa|id_ed25519|.*\.pem|.*\.key))\b/gi;
    while ((m = fallbackRegex.exec(text)) !== null) {
      const f = m[2].replace(/`/g, '');
      if (!files.includes(f)) files.push(f);
    }

    const unblockMatch = text.match(/https:\/\/github\.com\/[^\s) '"]*unblock-secret[^\s) '"]*/i);
    const resolveMatch = text.match(/https:\/\/docs\.github\.com\/[^\s) '"]*push-protection[^\s) '"]*/i);

    return {
      code: 'SECRET_BLOCKED',
      secretTypes,
      files,
      unblockUrl: unblockMatch ? unblockMatch[0] : null,
      resolveUrl: resolveMatch ? resolveMatch[0] : 'https://docs.github.com/code-security/secret-scanning/pushing-a-branch-blocked-by-push-protection'
    };
  }

  if (lower.includes('authentication failed') || lower.includes('could not read username') || lower.includes('invalid username or password') || lower.includes('permission denied')) {
    return { code: 'AUTH_FAILED', secretTypes: [], files: [], unblockUrl: null, resolveUrl: null };
  }
  if (lower.includes('non-fast-forward') || lower.includes('failed to push some refs') || lower.includes('fetch first') || lower.includes('rejected')) {
    return { code: 'NON_FAST_FORWARD', secretTypes: [], files: [], unblockUrl: null, resolveUrl: null };
  }
  if (lower.includes('repository not found') || lower.includes('could not resolve host') || lower.includes('network') || lower.includes('unable to access')) {
    return { code: 'REMOTE_OR_NETWORK', secretTypes: [], files: [], unblockUrl: null, resolveUrl: null };
  }
  return { code: 'UNKNOWN', secretTypes: [], files: [], unblockUrl: null, resolveUrl: null };
}

/**
 * Quét nhanh staged files để cảnh báo TRƯỚC khi commit/push.
 * Chỉ cảnh báo, không chặn — tránh false-positive.
 * @param {string} cwd
 * @returns {string[]} danh sách file khả nghi
 */
export function findRiskyStagedFiles(cwd = process.cwd()) {
  const denyList = [/^\.env(\..+)?$/, /^\.npmrc$/, /_rsa$/, /_ed25519$/, /\.pem$/, /\.key$/, /secrets?\.json$/i];
  try {
    const out = execSync('git diff --cached --name-only', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map((s) => s.trim()).filter(Boolean).filter((f) => {
      const base = path.basename(f);
      return denyList.some((re) => re.test(base) || re.test(f));
    });
  } catch {
    return [];
  }
}
