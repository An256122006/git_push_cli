import { spawnSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function checkNpmInstalled() {
  try {
    execSync('npm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function getPackageInfo(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    return { name: pkg.name || '(chưa đặt tên)', version: pkg.version || '0.0.0', hasPublishConfig: !!pkg.publishConfig };
  } catch {
    return null;
  }
}

/** Đang login npm chưa? (không in token ra) */
export function checkNpmLogin(cwd = process.cwd()) {
  const r = spawnSync('npm', ['whoami'], { cwd, encoding: 'utf-8' });
  if (r.status === 0) return { loggedIn: true, user: r.stdout.trim() };
  return { loggedIn: false, user: null };
}

/**
 * Cảnh báo nếu .npmrc chứa token đang bị track trong git.
 * Chỉ kiểm tra tên file, KHÔNG đọc/in token.
 */
export function isNpmrcTracked(cwd = process.cwd()) {
  try {
    const out = execSync('git ls-files', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').map((s) => s.trim()).includes('.npmrc');
  } catch {
    return false;
  }
}

/**
 * Publish lên npm. Token lấy từ `npm login` hoặc env NPM_TOKEN,
 * KHÔNG nhận token qua flag để tránh lộ trong shell history.
 */
export function publishToNpm({ access = 'public', dryRun = false, cwd = process.cwd() } = {}) {
  const args = ['publish'];
  if (access) args.push('--access', access);
  if (dryRun) args.push('--dry-run');

  const env = { ...process.env };
  // Ưu tiên NPM_TOKEN từ env nếu có (CI). Không log giá trị này.
  if (env.NPM_TOKEN && !env.NODE_AUTH_TOKEN) {
    env.NODE_AUTH_TOKEN = env.NPM_TOKEN;
  }

  const r = spawnSync('npm', args, { cwd, encoding: 'utf-8', env });
  const output = ((r.stdout || '') + '\n' + (r.stderr || '')).trim();
  if (r.status === 0) {
    return { ok: true, output };
  }
  return { ok: false, output, parsed: parseNpmError(output) };
}

export function parseNpmError(output = '') {
  const lower = output.toLowerCase();
  if (lower.includes('eneedauth') || lower.includes('need auth') || lower.includes('401') || lower.includes('you must be logged in')) {
    return { code: 'NEED_AUTH', hint: 'Chưa login npm. Chạy: npm login  (hoặc set env NPM_TOKEN khi chạy CI)' };
  }
  if (lower.includes('e403') || lower.includes('403 forbidden')) {
    return { code: 'FORBIDDEN', hint: 'Không có quyền publish tên này (bị trùng tên hoặc chưa được add collaborator). Đổi name trong package.json hoặc xin quyền.' };
  }
  if (lower.includes('epublishconflict') || lower.includes('cannot publish over previously published')) {
    return { code: 'VERSION_EXISTS', hint: 'Version này đã tồn tại. Tăng version: npm version patch  rồi publish lại.' };
  }
  if (lower.includes('e400') || lower.includes('invalid package name') || lower.includes('invalid name')) {
    return { code: 'BAD_NAME', hint: 'Tên package chưa hợp lệ trong package.json (chữ thường, không dấu cách).' };
  }
  return { code: 'UNKNOWN', hint: 'Xem log npm phía trên để biết chi tiết.' };
}
