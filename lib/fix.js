import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { findRiskyStagedFiles } from './git.js';
import { scanStagedContentForSecrets } from './secrets.js';

/**
 * Danh sách phần mở rộng của file mã nguồn / tài liệu.
 * KHÔNG BAO GIỜ tự động thêm các file này vào .gitignore vì sẽ làm mất code dự án!
 */
const CODE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx',
  '.py', '.java', '.go', '.rs', '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs', '.php', '.rb', '.html', '.htm', '.css', '.scss', '.sass',
  '.less', '.vue', '.svelte', '.md', '.markdown', '.txt', '.sh',
  '.bash', '.zsh', '.bat', '.cmd', '.ps1', '.sql'
]);

function isCodeOrDocFile(filePath) {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  if (base === 'package.json' || base === 'package-lock.json' || base === 'tsconfig.json') return true;
  return CODE_EXTENSIONS.has(ext);
}

/**
 * Tự fix an toàn khi phát hiện secret:
 *  1. git rm --cached -r -f <file> (gỡ khỏi commit, giữ nguyên file trên máy)
 *  2. Thêm rule tương ứng vào .gitignore (chỉ áp dụng cho file cấu hình secret, KHÔNG ignore file code)
 *  3. Tự động stage lại .gitignore để sẵn sàng commit
 *
 * @param {string[]} files danh sách file cần gỡ (vd ['.env', '.npmrc'])
 * @param {string} cwd
 * @returns {{ fixed: string[], alreadyClean: string[], failed: {file:string, reason:string}[], gitignoreAdded: string[], codeFilesWithSecrets: string[] }}
 */
export function autoFixStagedSecrets(files = [], cwd = process.cwd()) {
  const unique = [...new Set((files || []).map((f) => String(f).trim()).filter(Boolean))];
  const result = {
    fixed: [],
    alreadyClean: [],
    failed: [],
    gitignoreAdded: [],
    codeFilesWithSecrets: []
  };
  if (unique.length === 0) return result;

  for (const file of unique) {
    const normalized = file.replace(/\\/g, '/');
    let ok = false;
    let errReason = '';

    // 1. Thử gỡ khỏi stage bằng git rm --cached -r -f
    const r = spawnSync('git', ['rm', '--cached', '-r', '-f', '--', normalized], { cwd, encoding: 'utf-8' });
    if (r.status === 0) {
      ok = true;
    } else {
      const msg = String(r.stderr || r.stdout || '');
      // Thử fallback bằng git restore --staged nếu git rm báo pathspec/not matched
      const rRestore = spawnSync('git', ['restore', '--staged', '--', normalized], { cwd, encoding: 'utf-8' });
      if (rRestore.status === 0) {
        ok = true;
      } else if (/did not match|pathspec/i.test(msg)) {
        result.alreadyClean.push(file);
        continue;
      } else {
        errReason = msg.trim().split('\n')[0] || 'unknown error';
      }
    }

    if (ok) {
      result.fixed.push(file);
    } else {
      result.failed.push({ file, reason: errReason || 'không gỡ được khỏi stage' });
    }
  }

  // 2. Phân loại và tạo rule .gitignore cho các file config secret (bỏ qua file code)
  const rules = [];
  for (const f of unique) {
    const normalized = f.replace(/\\/g, '/');
    const base = path.basename(normalized);

    if (isCodeOrDocFile(normalized)) {
      // File mã nguồn có dính secret: gỡ khỏi stage nhưng không cho vào .gitignore
      result.codeFilesWithSecrets.push(f);
      continue;
    }

    if (/^\.env(\..+)?$/i.test(base)) {
      rules.push('.env*');
    } else if (base.toLowerCase() === '.npmrc') {
      rules.push('.npmrc');
    } else if (/\.pem$|\.key$/i.test(base)) {
      rules.push('*.pem\n*.key');
    } else if (/id_rsa|id_ed25519|id_ecdsa|id_dsa/i.test(base)) {
      rules.push('id_rsa*\nid_ed25519*\nid_ecdsa*');
    } else if (/secrets?\.json$|credentials?\.json$|service-account.*\.json$/i.test(base)) {
      rules.push('*secret*.json\n*credential*.json');
    } else if (/\.pfx$|\.p12$/i.test(base)) {
      rules.push('*.pfx\n*.p12');
    } else {
      rules.push(normalized);
    }
  }

  const gitignorePath = path.join(cwd, '.gitignore');
  let existing = '';
  try {
    if (fs.existsSync(gitignorePath)) existing = fs.readFileSync(gitignorePath, 'utf-8');
  } catch { existing = ''; }

  const existingLines = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const toAdd = [];
  for (const chunk of rules) {
    for (const line of String(chunk).split(/\r?\n/)) {
      const t = line.trim();
      if (t && !existingLines.has(t)) {
        toAdd.push(t);
        existingLines.add(t);
      }
    }
  }

  if (toAdd.length > 0) {
    try {
      const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
      fs.appendFileSync(gitignorePath, prefix + toAdd.join('\n') + '\n', 'utf-8');
      result.gitignoreAdded = toAdd;

      // Tự động stage ngay .gitignore để không bị sót khi commit
      spawnSync('git', ['add', '.gitignore'], { cwd });
    } catch {
      // Bỏ qua lỗi ghi file
    }
  }

  return result;
}

/** Kiểm tra còn gì để commit sau khi auto-fix không */
export function hasStagedChanges(cwd = process.cwd()) {
  try {
    const r = spawnSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) return false;
    return (r.stdout || '').trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Quét các file secret phổ biến trong thư mục làm việc nhưng chưa được ignore trong .gitignore
 */
export function findRiskyWorkingTreeFiles(cwd = process.cwd()) {
  const denyNames = [
    '.env', '.env.local', '.env.development', '.env.production',
    '.npmrc', 'secrets.json', 'secret.json', 'credentials.json',
    'id_rsa', 'id_ed25519'
  ];
  const found = [];
  for (const name of denyNames) {
    const fullPath = path.join(cwd, name);
    if (fs.existsSync(fullPath)) {
      const r = spawnSync('git', ['check-ignore', '-q', name], { cwd });
      if (r.status !== 0) {
        found.push(name);
      }
    }
  }
  return found;
}

/**
 * Tìm upstream ref của branch hiện tại (VD: origin/main hoặc origin/master)
 */
export function getUpstreamRef(branch = 'main', cwd = process.cwd()) {
  const cleanBranch = String(branch || 'main').trim() || 'main';
  // Chặn ký tự shell/git nguy hiểm trước khi truyền (dù đã dùng spawnSync mảng args)
  if (/[\s~^:?*\[\\@{]/.test(cleanBranch) || cleanBranch.includes('..')) return null;
  try {
    const r = spawnSync('git', ['rev-parse', '--abbrev-ref', `${cleanBranch}@{u}`], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0) {
      const upstream = (r.stdout || '').trim();
      if (upstream) return upstream;
    }
  } catch {}

  const candidates = [`origin/${cleanBranch}`, 'origin/main', 'origin/master'];
  for (const ref of candidates) {
    try {
      const r = spawnSync('git', ['rev-parse', '--verify', ref], { cwd, stdio: 'ignore' });
      if (r.status === 0) return ref;
    } catch {}
  }
  return null;
}

/**
 * Lấy danh sách các commit unpushed (chưa đẩy lên remote)
 */
export function getUnpushedCommits(branch = 'main', cwd = process.cwd()) {
  const upstream = getUpstreamRef(branch, cwd);
  if (!upstream) {
    try {
      const r = spawnSync('git', ['log', '--oneline'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
      if (r.status !== 0) return [];
      return (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
    } catch {
      return [];
    }
  }
  try {
    const r = spawnSync('git', ['log', `${upstream}..HEAD`, '--oneline'], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status !== 0) return [];
    return (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Squash các commit chưa push thành 1 commit duy nhất sạch sẽ,
 * loại bỏ hoàn toàn dấu vết secret ở các commit trung gian (ví dụ commit cũ chứa .npmrc hay .env).
 */
export function squashUnpushedCommits(branch = 'main', commitMsg = 'Clean commit without secrets', dateFormatted = null, cwd = process.cwd()) {
  const upstream = getUpstreamRef(branch, cwd);
  const usedAmendForRoot = { value: false };
  try {
    if (upstream) {
      const r1 = spawnSync('git', ['reset', '--soft', upstream], { cwd, encoding: 'utf-8' });
      if (r1.status !== 0) {
        throw new Error(String(r1.stderr || r1.stdout || 'Không thể reset về upstream').trim());
      }
    } else {
      // Chưa có upstream (repo mới hoàn toàn): squash TẤT CẢ thành 1 commit duy nhất
      // bằng reset --soft về root rồi --amend root (thay vì commit mới gây ra 2 commits).
      const rRoot = spawnSync('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd, encoding: 'utf-8' });
      if (rRoot.status !== 0) throw new Error('Không đọc được root commit.');
      const rootCommit = (rRoot.stdout || '').trim().split(/\s+/)[0];
      if (!rootCommit) throw new Error('Không tìm thấy root commit.');
      const rReset = spawnSync('git', ['reset', '--soft', rootCommit], { cwd, encoding: 'utf-8' });
      if (rReset.status !== 0) throw new Error('Không thể reset về root commit.');
      usedAmendForRoot.value = true;
    }

    // Quét lại và loại bỏ bất kỳ secret file nào còn sót trong staged
    const risky = findRiskyStagedFiles(cwd);
    const findings = scanStagedContentForSecrets(cwd);
    const allSecretFiles = [...new Set([...risky, ...findings.map((f) => f.file)])];
    if (allSecretFiles.length > 0) {
      autoFixStagedSecrets(allSecretFiles, cwd);
    }

    // Đảm bảo .gitignore được stage (nếu tồn tại)
    spawnSync('git', ['add', '.gitignore'], { cwd });

    if (!hasStagedChanges(cwd) && !usedAmendForRoot.value) {
      return { ok: false, error: 'Không còn thay đổi nào để squash thành commit mới.' };
    }

    // Tạo commit mới sạch
    const env = { ...process.env };
    if (dateFormatted) {
      env.GIT_AUTHOR_DATE = dateFormatted;
      env.GIT_COMMITTER_DATE = dateFormatted;
    }
    const safeMsg = String(commitMsg || 'Clean commit without secrets');
    let rCommit;
    if (usedAmendForRoot.value) {
      // Amend root để giữ đúng 1 commit duy nhất cho repo chưa có upstream
      rCommit = spawnSync('git', ['commit', '--amend', '-m', safeMsg], { cwd, env, encoding: 'utf-8' });
    } else {
      rCommit = spawnSync('git', ['commit', '-m', safeMsg], { cwd, env, encoding: 'utf-8' });
    }
    if (rCommit.status !== 0) {
      const msg = String(rCommit.stderr || rCommit.stdout || '').trim();
      if (msg.toLowerCase().includes('nothing to commit')) {
        return { ok: false, error: 'Không có gì để commit sau khi làm sạch (working tree sạch).' };
      }
      throw new Error(msg || 'Lỗi khi tạo commit squash');
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
