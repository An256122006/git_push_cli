import { spawn } from 'child_process';
import { getGitHubToken, saveGitHubToken } from './config.js';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_OAUTH_CLIENT_ID = '178c6fc778ccc68e1d6a'; 

/**
 * Mở URL trên trình duyệt web mặc định của hệ thống
 * @param {string} url 
 */
export function openBrowser(url) {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' });
    } else if (platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Khởi tạo GitHub OAuth Device Authorization Flow
 * @returns {Promise<{ ok: boolean, data?: { device_code: string, user_code: string, verification_uri: string, expires_in: number, interval: number }, error?: string }>}
 */
export async function initiateDeviceFlow() {
  try {
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        scope: 'repo read:org gist'
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error_description || err.message || `Lỗi API (${res.status})` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: `Lỗi kết nối mạng: ${err.message}` };
  }
}

/**
 * Polling kiểm tra người dùng đã Authorize trên GitHub chưa
 * @param {string} deviceCode 
 * @param {number} intervalSeconds 
 * @param {number} expiresInSeconds 
 * @param {(status: string) => void} onStatusUpdate 
 * @returns {Promise<{ ok: boolean, token?: string, error?: string }>}
 */
export async function pollDeviceToken(deviceCode, intervalSeconds = 5, expiresInSeconds = 900, onStatusUpdate = null) {
  let interval = Math.max(2, intervalSeconds);
  const startTime = Date.now();
  const maxTime = expiresInSeconds * 1000;
  let consecutiveNetErrors = 0;

  while (Date.now() - startTime < maxTime) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));

    try {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_OAUTH_CLIENT_ID,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        })
      });

      consecutiveNetErrors = 0;
      const data = await res.json();

      if (data.access_token) {
        return { ok: true, token: data.access_token };
      }

      if (data.error === 'authorization_pending') {
        if (onStatusUpdate) onStatusUpdate('pending');
        continue;
      }

      if (data.error === 'slow_down') {
        interval = (data.interval || interval) + 5;
        if (onStatusUpdate) onStatusUpdate('slow_down');
        continue;
      }

      if (data.error === 'expired_token') {
        return { ok: false, error: 'Mã xác thực đã hết hạn. Vui lòng thử lại.' };
      }

      if (data.error === 'access_denied') {
        return { ok: false, error: 'Bạn đã từ chối cấp quyền trên GitHub.' };
      }

      return { ok: false, error: data.error_description || data.error || 'Lỗi xác thực không xác định' };
    } catch (err) {
      // Mạng chập chờn: thử lại vài lần, lỗi liên tục thì thoát sớm thay vì chờ hết 15 phút
      consecutiveNetErrors++;
      if (consecutiveNetErrors >= 5) {
        return { ok: false, error: `Lỗi kết nối mạng lặp lại (${err.message}). Vui lòng kiểm tra mạng rồi thử lại.` };
      }
      continue;
    }
  }

  return { ok: false, error: 'Hết thời gian chờ cấp quyền (Timeout).' };
}

/**
 * Tạo headers chuẩn cho GitHub REST API
 * @param {string} token 
 * @returns {Record<string, string>}
 */
function getApiHeaders(token) {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'git-push-time-cli'
  };
}

/**
 * Kiểm tra token và lấy thông tin tài khoản GitHub
 * @param {string} token 
 * @returns {Promise<{ ok: boolean, user?: any, error?: string }>}
 */
export async function verifyAndFetchUser(token) {
  if (!token || !token.trim()) {
    return { ok: false, error: 'Token không được để trống.' };
  }

  try {
    const res = await fetch(`${GITHUB_API_BASE}/user`, {
      method: 'GET',
      headers: getApiHeaders(token.trim())
    });

    if (res.status === 401) {
      return { ok: false, error: 'Token không hợp lệ hoặc đã hết hạn (401 Unauthorized).' };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.message || `Lỗi kết nối GitHub API (${res.status})` };
    }

    const user = await res.json();
    return { ok: true, user };
  } catch (err) {
    return { ok: false, error: `Lỗi kết nối mạng: ${err.message}` };
  }
}

/**
 * Lấy thông tin user hiện tại từ token đang kích hoạt
 * @returns {Promise<{ authenticated: boolean, user?: any, source?: string, token?: string, error?: string }>}
 */
export async function getCurrentGitHubUser() {
  const { token, source, user: cachedUser } = getGitHubToken();
  if (!token) {
    return { authenticated: false, error: 'Chưa kết nối tài khoản GitHub' };
  }

  // Thử verify với API
  const check = await verifyAndFetchUser(token);
  if (!check.ok) {
    // Nếu lỗi mạng nhưng có cache user
    if (cachedUser) {
      return { authenticated: true, user: cachedUser, token, source, offline: true };
    }
    return { authenticated: false, error: check.error, source };
  }

  // Cập nhật lại cache user vào config — chỉ ghi khi có thay đổi để tránh I/O mỗi lần render menu
  if (source === 'config') {
    const cachedLogin = cachedUser?.login;
    if (!cachedLogin || cachedLogin !== check.user?.login || JSON.stringify(cachedUser) !== JSON.stringify({
      login: check.user.login,
      name: check.user.name,
      avatar_url: check.user.avatar_url,
      email: check.user.email,
      bio: check.user.bio,
      public_repos: check.user.public_repos,
      total_private_repos: check.user.total_private_repos,
      html_url: check.user.html_url
    })) {
      saveGitHubToken(token, check.user);
    }
  }

  return { authenticated: true, user: check.user, token, source };
}

/**
 * Lấy danh sách repository của user hiện tại
 * @param {object} options
 * @param {number} options.limit Số lượng repo tối đa
 * @param {'all' | 'owner' | 'public' | 'private'} options.type
 * @returns {Promise<{ ok: boolean, repos?: any[], error?: string }>}
 */
export async function listUserRepos({ limit = 30, type = 'owner' } = {}) {
  const { token } = getGitHubToken();
  if (!token) {
    return { ok: false, error: 'Chưa có GitHub Token. Vui lòng kết nối tài khoản trước.' };
  }

  try {
    const url = new URL(`${GITHUB_API_BASE}/user/repos`);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', String(Math.min(100, Math.max(1, limit))));
    url.searchParams.set('type', type);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: getApiHeaders(token)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.message || `Không thể tải danh sách repo (${res.status})` };
    }

    const repos = await res.json();
    return { ok: true, repos };
  } catch (err) {
    return { ok: false, error: `Lỗi kết nối: ${err.message}` };
  }
}

/**
 * Tạo repository mới trên GitHub
 * @param {object} params
 * @param {string} params.name Tên repo (bắt buộc)
 * @param {string} [params.description] Mô tả repo
 * @param {boolean} [params.isPrivate] Repo riêng tư hay công khai
 * @param {boolean} [params.autoInit] Có tự tạo README.md ban đầu không (mặc định false để push project có sẵn)
 * @returns {Promise<{ ok: boolean, repo?: any, error?: string }>}
 */
export async function createGitHubRepo({ name, description = '', isPrivate = false, autoInit = false }) {
  const { token } = getGitHubToken();
  if (!token) {
    return { ok: false, error: 'Chưa có GitHub Token. Vui lòng kết nối tài khoản trước.' };
  }

  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return { ok: false, error: 'Tên repository không được để trống.' };
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(cleanName)) {
    return { ok: false, error: 'Tên repo chỉ được chứa chữ cái, số, dấu gạch nối (-), gạch dưới (_), hoặc dấu chấm (.).' };
  }

  try {
    const payload = {
      name: cleanName,
      description: (description || '').trim(),
      private: Boolean(isPrivate),
      auto_init: Boolean(autoInit)
    };

    const res = await fetch(`${GITHUB_API_BASE}/user/repos`, {
      method: 'POST',
      headers: {
        ...getApiHeaders(token),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 422) {
      const errData = await res.json().catch(() => ({}));
      const msg = (errData.errors && errData.errors[0]?.message) || errData.message || 'Tên repository đã tồn tại hoặc không hợp lệ.';
      return { ok: false, error: `Không thể tạo repo: ${msg}` };
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { ok: false, error: errData.message || `Lỗi từ GitHub API (${res.status})` };
    }

    const repo = await res.json();
    return {
      ok: true,
      repo: {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        isPrivate: repo.private,
        description: repo.description || '',
        htmlUrl: repo.html_url,
        cloneUrl: repo.clone_url,
        sshUrl: repo.ssh_url,
        defaultBranch: repo.default_branch || 'main',
        createdAt: repo.created_at
      }
    };
  } catch (err) {
    return { ok: false, error: `Lỗi kết nối khi tạo repo: ${err.message}` };
  }
}
