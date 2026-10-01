import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const CONFIG_DIR = path.join(os.homedir(), '.git-push-time');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    } catch {
      // Ignore directory creation errors
    }
  }
}

/**
 * Đọc toàn bộ file cấu hình người dùng
 * @returns {Record<string, any>}
 */
export function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // Ignore JSON parse errors
  }
  return {};
}

/**
 * Lưu cấu hình người dùng
 * @param {Record<string, any>} data 
 */
export function saveConfig(data) {
  try {
    ensureConfigDir();
    const current = getConfig();
    const merged = { ...current, ...data };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    try {
      // Token nhạy cảm: giới hạn quyền đọc chỉ owner (chmod 600)
      fs.chmodSync(CONFIG_FILE, 0o600);
    } catch {
      // Bỏ qua trên Windows hoặc FS không hỗ trợ chmod
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Lấy danh sách tất cả các tài khoản GitHub đã lưu
 * @returns {Array<{ login: string, name: string, token: string, active: boolean, avatar_url?: string }>}
 */
export function getAllGitHubAccounts() {
  const cfg = getConfig();
  const accountsMap = cfg.githubAccounts || {};
  const activeLogin = cfg.activeGitHubLogin || (cfg.github?.user?.login) || null;

  const result = [];
  for (const [login, acc] of Object.entries(accountsMap)) {
    if (acc && typeof acc.token === 'string' && acc.token.trim()) {
      result.push({
        login,
        name: acc.user?.name || login,
        avatar_url: acc.user?.avatar_url || '',
        token: acc.token,
        active: login === activeLogin
      });
    }
  }

  // Tương thích ngược với trường `github` cũ nếu chưa migrate
  if (result.length === 0 && cfg.github && cfg.github.token) {
    const login = cfg.github.user?.login || 'default';
    result.push({
      login,
      name: cfg.github.user?.name || login,
      avatar_url: cfg.github.user?.avatar_url || '',
      token: cfg.github.token,
      active: true
    });
  }

  return result;
}

/**
 * Đặt tài khoản GitHub đang kích hoạt
 * @param {string} login 
 */
export function setActiveGitHubAccount(login) {
  const cfg = getConfig();
  cfg.activeGitHubLogin = login;
  if (cfg.githubAccounts && cfg.githubAccounts[login]) {
    cfg.github = {
      token: cfg.githubAccounts[login].token,
      user: cfg.githubAccounts[login].user,
      savedAt: new Date().toISOString()
    };
  }
  return saveConfig(cfg);
}

/**
 * Lấy GitHub token từ nhiều nguồn theo thứ tự ưu tiên:
 * 1. Biến môi trường GITHUB_TOKEN hoặc GH_TOKEN
 * 2. Tài khoản GitHub active trong file config
 * 3. Token từ GitHub CLI (`gh auth token`) nếu có
 * @returns {{ token: string | null, source: 'env' | 'config' | 'gh-cli' | null, user?: any }}
 */
export function getGitHubToken() {
  // 1. Kiểm tra Environment variables
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return { token: process.env.GITHUB_TOKEN.trim(), source: 'env' };
  }
  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
    return { token: process.env.GH_TOKEN.trim(), source: 'env' };
  }

  // 2. Kiểm tra File config đã lưu
  const cfg = getConfig();
  const activeLogin = cfg.activeGitHubLogin;
  if (activeLogin && cfg.githubAccounts && cfg.githubAccounts[activeLogin]) {
    const acc = cfg.githubAccounts[activeLogin];
    if (acc && typeof acc.token === 'string' && acc.token.trim()) {
      return { token: acc.token.trim(), source: 'config', user: acc.user };
    }
    return { token: null, source: null };
  }
  if (cfg.github && cfg.github.token && typeof cfg.github.token === 'string') {
    return { token: cfg.github.token.trim(), source: 'config', user: cfg.github.user };
  }

  // 3. Kiểm tra GitHub CLI gh
  try {
    const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      return { token: r.stdout.trim(), source: 'gh-cli' };
    }
  } catch {
    // gh not installed or error
  }

  return { token: null, source: null };
}

/**
 * Lưu tài khoản GitHub vào file config (hỗ trợ đa tài khoản)
 * @param {string} token 
 * @param {object} userInfo 
 */
export function saveGitHubToken(token, userInfo = null) {
  if (!token || typeof token !== 'string' || !token.trim()) return false;
  const current = getConfig();
  if (!current.githubAccounts) {
    current.githubAccounts = {};
  }

  const login = userInfo?.login || current.github?.user?.login || 'default';
  current.githubAccounts[login] = {
    token: token.trim(),
    savedAt: new Date().toISOString(),
    user: userInfo ? {
      login: userInfo.login,
      name: userInfo.name,
      avatar_url: userInfo.avatar_url,
      email: userInfo.email,
      bio: userInfo.bio,
      public_repos: userInfo.public_repos,
      total_private_repos: userInfo.total_private_repos,
      html_url: userInfo.html_url
    } : (current.githubAccounts[login]?.user || null)
  };

  current.activeGitHubLogin = login;
  current.github = {
    token: token.trim(),
    user: current.githubAccounts[login].user,
    savedAt: new Date().toISOString()
  };

  return saveConfig(current);
}

/**
 * Xóa tài khoản GitHub khỏi file config
 * @param {string} [login] nếu không truyền sẽ xóa tài khoản active
 */
export function removeGitHubToken(login = null) {
  const current = getConfig();
  const targetLogin = login || current.activeGitHubLogin || current.github?.user?.login;

  if (targetLogin && current.githubAccounts && current.githubAccounts[targetLogin]) {
    delete current.githubAccounts[targetLogin];
  }

  if (current.activeGitHubLogin === targetLogin) {
    const remaining = Object.keys(current.githubAccounts || {});
    current.activeGitHubLogin = remaining.length > 0 ? remaining[0] : null;
    if (current.activeGitHubLogin && current.githubAccounts[current.activeGitHubLogin]) {
      current.github = {
        token: current.githubAccounts[current.activeGitHubLogin].token,
        user: current.githubAccounts[current.activeGitHubLogin].user
      };
    } else {
      delete current.github;
    }
  } else if (!targetLogin && current.github) {
    delete current.github;
  }

  return saveConfig(current);
}
