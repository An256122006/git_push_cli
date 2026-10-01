import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Kiểm tra xem máy tính đã cài đặt Git hay chưa
 * @returns {boolean}
 */
export function checkGitInstalled() {
  try {
    const r = spawnSync('git', ['--version'], { stdio: 'ignore' });
    return r.status === 0;
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
  // Dùng spawnSync dạng mảng args (không qua shell) để tránh lỗi trên Windows
  // khi folder chứa file tên git.* (vd: git.js) — cmd.exe sẽ nhầm `git` thành file đó do PATHEXT.
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf-8' });
  return r.status === 0 && (r.stdout || '').trim() === 'true';
}

/**
 * Khởi tạo Git repo trong thư mục hiện tại
 * @param {string} cwd
 */
export function initGitRepo(cwd = process.cwd()) {
  const r = spawnSync('git', ['init'], { cwd, encoding: 'utf-8' });
  if (r.status !== 0) {
    throw new Error(String(r.stderr || r.stdout || 'git init thất bại').trim());
  }
}

/**
 * Lấy top-level của Git repo chứa `cwd` (đi ngược lên cha).
 * Trả về null nếu không nằm trong repo nào.
 * @param {string} cwd
 * @returns {string|null}
 */
export function getGitTopLevel(cwd = process.cwd()) {
  // Dùng spawnSync (không qua shell) — xem ghi chú ở isGitRepo.
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8' });
  if (r.status !== 0) return null;
  const out = (r.stdout || '').trim();
  return out ? path.normalize(out) : null;
}

/**
 * Liệt kê các thư mục con trực tiếp của `cwd` để user chọn folder nguồn push.
 * Bỏ qua .git để tránh nhầm. Sắp xếp: thư mục thường trước, ẩn sau.
 * @param {string} cwd
 * @returns {{ name: string, fullPath: string }[]}
 */
export function listSubdirectories(cwd = process.cwd()) {
  try {
    const entries = fs.readdirSync(cwd, { withFileTypes: true });
    return entries
      .filter((e) => {
        if (!e.isDirectory()) return false;
        if (e.name === '.git') return false;
        // Bỏ qua symlink gãy
        try {
          fs.statSync(path.join(cwd, e.name));
          return true;
        } catch {
          return false;
        }
      })
      .map((e) => ({ name: e.name, fullPath: path.join(cwd, e.name) }))
      .sort((a, b) => {
        const aHidden = a.name.startsWith('.') ? 1 : 0;
        const bHidden = b.name.startsWith('.') ? 1 : 0;
        if (aHidden !== bHidden) return aHidden - bHidden;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

/**
 * Chuẩn hoá đường dẫn folder nguồn do user nhập/truyền vào.
 * @param {string} inputPath đường dẫn tương đối hoặc tuyệt đối
 * @param {string} base thư mục gốc để resolve đường dẫn tương đối
 * @returns {{ ok: boolean, fullPath?: string, error?: string }}
 */
export function resolveTargetDir(inputPath, base = process.cwd()) {
  if (!inputPath || !String(inputPath).trim()) {
    return { ok: false, error: 'Đường dẫn trống.' };
  }
  const fullPath = path.resolve(base, String(inputPath).trim());
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) return { ok: false, error: `'${inputPath}' không phải là thư mục.` };
  } catch {
    return { ok: false, error: `Không tìm thấy thư mục '${inputPath}'.` };
  }
  return { ok: true, fullPath };
}

/**
 * Lấy tên branch hiện tại (hoặc mặc định là main cho hiển thị).
 * Lưu ý: trả về 'main' khi detached HEAD để tương thích UI cũ.
 * Dùng getCurrentBranchStrict() khi cần phát hiện detached chính xác.
 * @param {string} cwd
 * @returns {string}
 */
export function getCurrentBranch(cwd = process.cwd()) {
  return getCurrentBranchStrict(cwd) || 'main';
}

/**
 * Lấy tên branch hiện tại, trả về null khi detached HEAD hoặc lỗi.
 * @param {string} cwd
 * @returns {string|null}
 */
export function getCurrentBranchStrict(cwd = process.cwd()) {
  // Dùng spawnSync (không qua shell) — xem ghi chú ở isGitRepo.
  const r = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8' });
  if (r.status !== 0) return null;
  return (r.stdout || '').trim() || null;
}

/**
 * Validate tên branch để chống injection.
 * @param {string} name
 * @returns {boolean}
 */
export function isValidBranchName(name) {
  if (!name || typeof name !== 'string') return false;
  const t = name.trim();
  if (!t || t.length > 255) return false;
  // Cấm ký tự điều khiển, space đầu/cuối, và các ký tự git cấm: ~ ^ : ? * [ \ ..
  // Cho phép chữ, số, / - _ . đơn giản nhất; từ chối còn lại để an toàn.
  if (/[\s~^:?*\[\\]@{]/.test(t)) return false;
  if (t.includes('..') || t.startsWith('/') || t.endsWith('/') || t.endsWith('.lock')) return false;
  if (t === 'HEAD') return false;
  return true;
}

/**
 * Thiết lập tên branch chính (ví dụ: git branch -M main)
 * @param {string} branchName
 * @param {string} cwd
 */
export function setBranchName(branchName = 'main', cwd = process.cwd()) {
  const clean = String(branchName || 'main').trim() || 'main';
  if (!isValidBranchName(clean)) {
    throw new Error(`Tên branch không hợp lệ: '${branchName}'`);
  }
  const r = spawnSync('git', ['branch', '-M', clean], { cwd, encoding: 'utf-8' });
  if (r.status !== 0) {
    // Nếu chưa có commit nào, command này có thể báo lỗi nhưng không sao
    const msg = String(r.stderr || r.stdout || '');
    if (!/no commits yet|unknown revision|ambiguous/i.test(msg)) {
      // Im lặng tương thích cũ; caller sẽ phát hiện ở bước push nếu thật sự lỗi
    }
  }
}

/**
 * Cấu hình remote `origin` cho Git repo
 * @param {string} repoUrl
 * @param {string} cwd
 */
export function setGitRemote(repoUrl, cwd = process.cwd()) {
  if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
    throw new Error('URL repository trống.');
  }
  const url = repoUrl.trim();
  try {
    const rList = spawnSync('git', ['remote'], { cwd, encoding: 'utf-8' });
    const remotes = (rList.stdout || '').split(/\r?\n/).map((s) => s.trim());
    let r;
    if (remotes.includes('origin')) {
      r = spawnSync('git', ['remote', 'set-url', 'origin', url], { cwd, encoding: 'utf-8' });
    } else {
      r = spawnSync('git', ['remote', 'add', 'origin', url], { cwd, encoding: 'utf-8' });
    }
    if (r.status !== 0) {
      throw new Error(String(r.stderr || r.stdout || 'git remote thất bại').trim());
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
  const r = spawnSync('git', ['add', '.'], { cwd, encoding: 'utf-8' });
  if (r.status !== 0) {
    throw new Error(String(r.stderr || r.stdout || 'git add thất bại').trim());
  }
}

/**
 * Kiểm tra xem có thay đổi (staged hoặc unstaged) chưa commit hay không
 * @param {string} cwd
 * @returns {boolean}
 */
export function hasChangesToCommit(cwd = process.cwd()) {
  try {
    const r = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
    if (r.status !== 0) return true;
    return (r.stdout || '').trim().length > 0;
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

export function pullFromRemote(remote = 'origin', branch = null, cwd = process.cwd(), { rebase = false } = {}) {
  const targetBranch = branch || getCurrentBranchStrict(cwd);
  if (!targetBranch) {
    throw new Error('Đang ở detached HEAD nên không xác định được branch để pull.');
  }
  const strategy = rebase ? '--rebase' : '--ff-only';
  const result = spawnSync('git', ['pull', strategy, remote, targetBranch], { cwd, encoding: 'utf-8', stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `Git pull ${strategy} thất bại`).trim());
  }
  return (result.stdout || '').trim();
}

export function getRecentCommits(limit = 30, cwd = process.cwd()) {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  // Dùng mảng args (không qua shell) để an toàn trên Windows (tránh lỗi với %, ^, {}).
  // --date=iso để hiển thị cả giờ phút khi chọn commit.
  const result = spawnSync('git', ['log', `--max-count=${safeLimit}`, '--format=%H%x09%h%x09%ad%x09%s', '--date=iso'], {
    cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    // Repo chưa có commit nào -> trả về rỗng để caller báo lỗi thân thiện.
    return [];
  }
  const output = (result.stdout || '').trim();
  if (!output) return [];
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    const [hash, shortHash, date, ...subject] = line.split('\t');
    return { hash, shortHash, date, subject: subject.join('\t') };
  });
}

/**
 * Sửa Author Date + Committer Date của 1 commit.
 * - Yêu cầu working tree sạch.
 * - Chỉ cho chạy trên branch thường (không detached HEAD).
 * - Commit phải nằm trên lịch sử branch hiện tại.
 * - Viết lại hash của commit đó và mọi commit phía sau (descendants).
 * - Giữ bản gốc bằng một nhánh backup tự động: backup/before-date-edit-*
 */
export function rewriteCommitDate(commitHash, dateFormatted, cwd = process.cwd()) {
  // 1. Working tree phải sạch.
  const statusRes = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8' });
  if (statusRes.status !== 0) throw new Error('Không đọc được trạng thái working tree.');
  if ((statusRes.stdout || '').trim()) throw new Error('Hãy commit hoặc stash thay đổi trước khi sửa thời gian commit.');

  // 2. Phải ở trên branch thường.
  const branchRes = spawnSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8' });
  const branch = (branchRes.stdout || '').trim();
  if (!branch) throw new Error('Không hỗ trợ sửa commit khi đang ở detached HEAD.');

  const headRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  if (headRes.status !== 0) throw new Error('Không xác định được HEAD của branch hiện tại.');
  const head = (headRes.stdout || '').trim();

  // Dùng mảng args để tránh shell escape ^{commit} trên Windows (cmd/PowerShell).
  const selRes = spawnSync('git', ['rev-parse', `${commitHash}^{commit}`], { cwd, encoding: 'utf-8' });
  if (selRes.status !== 0) throw new Error('Không tìm thấy commit cần sửa.');
  const selected = (selRes.stdout || '').trim();

  const isAncestor = spawnSync('git', ['merge-base', '--is-ancestor', selected, head], { cwd, stdio: 'ignore' });
  if (isAncestor.status !== 0) throw new Error('Commit này không nằm trên lịch sử của branch hiện tại.');

  // 3. Chỉ liệt kê commit từ selected tới HEAD (đỡ nặng, đúng semantics viết lại descendants).
  let revRange = head;
  const hasParent = spawnSync('git', ['rev-parse', '--verify', `${selected}^`], { cwd, stdio: 'ignore' });
  if (hasParent.status === 0) {
    revRange = `${selected}^..${head}`;
  }
  const listRes = spawnSync('git', ['rev-list', '--reverse', '--topo-order', revRange], { cwd, encoding: 'utf-8' });
  if (listRes.status !== 0) throw new Error('Không đọc được lịch sử commit.');
  const commits = (listRes.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  if (!commits.includes(selected)) throw new Error('Commit này không nằm trên lịch sử của branch hiện tại.');

  const epoch = Math.floor(new Date(dateFormatted).getTime() / 1000);
  if (!Number.isFinite(epoch)) throw new Error('Thời gian commit không hợp lệ.');
  // Format trong object commit là "<epoch> <tz>", KHÔNG có ký tự @.
  const gitDate = `${epoch} +0000`;

  const remapped = new Map();
  let changed = false;

  for (const hash of commits) {
    const catRes = spawnSync('git', ['cat-file', 'commit', hash], { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    if (catRes.status !== 0) throw new Error(`Không đọc được commit ${hash.slice(0, 7)}.`);
    const raw = catRes.stdout || '';
    const splitAt = raw.indexOf('\n\n');
    if (splitAt === -1) throw new Error(`Commit ${hash.slice(0, 7)} có định dạng không hợp lệ.`);
    const headers = raw.slice(0, splitAt).split('\n');
    const message = raw.slice(splitAt);
    const parents = headers.filter((line) => line.startsWith('parent ')).map((line) => line.slice(7));
    const mappedParents = parents.map((parent) => remapped.get(parent) || parent);
    const parentChanged = mappedParents.some((parent, i) => parent !== parents[i]);
    if (hash !== selected && !parentChanged) continue;

    if (headers.some((line) => line === 'gpgsig' || line.startsWith('gpgsig '))) {
      throw new Error('Lịch sử có commit đã ký số; sửa ngày sẽ làm chữ ký mất hiệu lực.');
    }
    let parentIndex = 0;
    const newHeaders = headers.map((line) => {
      if (line.startsWith('parent ')) return `parent ${mappedParents[parentIndex++]}`;
      if (hash === selected && (line.startsWith('author ') || line.startsWith('committer '))) {
        return line.replace(/\s-?\d+\s[+-]\d{4}$/, ` ${gitDate}`);
      }
      return line;
    });
    if (hash === selected && !newHeaders.some((line) => line.startsWith('author ') && line.endsWith(gitDate))) {
      throw new Error('Không thể phân tích metadata của commit.');
    }
    const result = spawnSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], {
      cwd, input: `${newHeaders.join('\n')}${message}`, encoding: 'utf-8'
    });
    if (result.status !== 0) throw new Error((result.stderr || 'Không thể tạo commit mới').trim());
    remapped.set(hash, (result.stdout || '').trim());
    changed = true;
  }

  const newHead = remapped.get(head) || head;
  if (!changed || newHead === head) throw new Error('Không tạo được commit đã sửa.');

  // 4. Giữ bản gốc bằng nhánh backup thật để user thấy trong `git branch`.
  const backupBranch = `backup/before-date-edit-${Date.now()}-${head.slice(0, 7)}`;
  const backupRef = `refs/heads/${backupBranch}`;
  const bkRes = spawnSync('git', ['update-ref', backupRef, head], { cwd, encoding: 'utf-8' });
  if (bkRes.status !== 0) throw new Error('Không tạo được nhánh backup.');
  const mvRes = spawnSync('git', ['update-ref', `refs/heads/${branch}`, newHead, head], { cwd, encoding: 'utf-8' });
  if (mvRes.status !== 0) {
    spawnSync('git', ['update-ref', '-d', backupRef], { cwd, stdio: 'ignore' });
    throw new Error((mvRes.stderr || 'Không thể cập nhật branch sau khi viết lại.').trim());
  }
  return { oldHead: head, newHead, backupRef, backupBranch, rewrittenCount: remapped.size };
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
    // fallback: tìm tên file khả nghi trong output (tránh greedy .* nuốt spaces)
    const fallbackRegex = /(^|\s)(`?\.?(env|npmrc|id_rsa|id_ed25519|[^\s`'"]*\.pem|[^\s`'"]*\.key))\b/gi;
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
  const denyList = [/^\.env(\..+)?$/i, /^\.npmrc$/i, /_rsa$/, /_ed25519$/, /\.pem$/i, /\.key$/i, /secrets?\.json$/i, /credentials?\.json$/i, /\.p12$/i, /\.pfx$/i];
  try {
    const r = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) return [];
    return (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).filter((f) => {
      const base = path.basename(f);
      return denyList.some((re) => re.test(base) || re.test(f));
    });
  } catch {
    return [];
  }
}
