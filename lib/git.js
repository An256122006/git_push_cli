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
    const stderr = result.stderr || result.stdout || 'Lỗi không xác định khi git push';
    throw new Error(stderr.trim());
  }
}
