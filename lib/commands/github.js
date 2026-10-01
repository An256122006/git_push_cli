import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { select } from '@inquirer/prompts';
import {
  getCurrentGitHubUser,
  verifyAndFetchUser,
  listUserRepos,
  createGitHubRepo,
  initiateDeviceFlow,
  pollDeviceToken,
  openBrowser
} from '../github.js';
import {
  saveGitHubToken,
  removeGitHubToken,
  getAllGitHubAccounts,
  setActiveGitHubAccount
} from '../config.js';
import { selectWithBack, inputWithBack, BACK } from '../prompt-helpers.js';
import {
  printSection,
  printGitHubProfile,
  printDeviceCodePrompt,
  printRepoCreatedBox,
  printErrorBox,
  printCancelled
} from '../ui.js';

/**
 * Hiển thị thông tin tài khoản GitHub hiện tại
 */
export async function showGitHubStatus() {
  const spinner = ora({ text: 'Đang kiểm tra kết nối GitHub…', color: 'cyan' }).start();
  const info = await getCurrentGitHubUser();
  spinner.stop();

  if (!info.authenticated) {
    printSection('TRẠNG THÁI GITHUB');
    console.log(chalk.hex('#F59E0B')('  [!] Chưa kết nối tài khoản GitHub.'));
    console.log(chalk.hex('#94A3B8')('  Chạy "git-push-time github login" để kết nối tài khoản qua trình duyệt.\n'));
    return false;
  }

  printGitHubProfile(info.user, info.source);
  return true;
}

/**
 * Đăng nhập GitHub qua OAuth Device Flow
 */
async function loginViaDeviceFlow() {
  const initSpinner = ora({ text: 'Đang kết nối GitHub OAuth…', color: 'cyan' }).start();
  const init = await initiateDeviceFlow();
  initSpinner.stop();

  if (!init.ok || !init.data) {
    printErrorBox('KẾT NỐI OAUTH THẤT BẠI', [init.error || 'Không nhận được mã xác thực từ GitHub.']);
    return null;
  }

  const { device_code, user_code, verification_uri, interval, expires_in } = init.data;

  // Hiển thị box mã xác thực cho user
  printDeviceCodePrompt({ userCode: user_code, verificationUri: verification_uri });

  // Tự động mở browser
  openBrowser(verification_uri);

  const pollSpinner = ora({
    text: chalk.hex('#38BDF8')('Đang chờ bạn xác nhận và nhấn [Authorize] trên trình duyệt…'),
    color: 'cyan'
  }).start();

  const pollResult = await pollDeviceToken(device_code, interval, expires_in, (status) => {
    if (status === 'slow_down') {
      pollSpinner.text = chalk.hex('#F59E0B')('GitHub yêu cầu giãn cách kết nối, đang tiếp tục chờ bạn xác nhận…');
    }
  });

  if (!pollResult.ok || !pollResult.token) {
    pollSpinner.fail(chalk.red('Xác thực thất bại!'));
    printErrorBox('ĐĂNG NHẬP THẤT BẠI', [pollResult.error]);
    return null;
  }

  pollSpinner.text = 'Đang tải thông tin tài khoản…';
  const userRes = await verifyAndFetchUser(pollResult.token);
  if (!userRes.ok) {
    pollSpinner.fail(chalk.red('Không thể tải profile GitHub!'));
    printErrorBox('LỖI PROFILE', [userRes.error]);
    return null;
  }

  saveGitHubToken(pollResult.token, userRes.user);
  pollSpinner.succeed(chalk.hex('#34D399').bold(`Đăng nhập thành công! Xin chào @${userRes.user.login}`));
  printGitHubProfile(userRes.user, 'oauth-device');
  return userRes.user;
}

/**
 * Đăng nhập GitHub bằng Personal Access Token (PAT)
 */
async function loginViaToken() {
  printSection('ĐĂNG NHẬP BẰNG PERSONAL ACCESS TOKEN');
  console.log(chalk.hex('#38BDF8')('  » Hướng dẫn lấy mã Token:'));
  console.log(chalk.hex('#94A3B8')('    1. Mở: https://github.com/settings/tokens'));
  console.log(chalk.hex('#94A3B8')('    2. Chọn "Generate new token (classic)"'));
  console.log(chalk.hex('#94A3B8')('    3. Tích chọn quyền: ') + chalk.hex('#34D399').bold('repo') + chalk.hex('#94A3B8')(' (Full control of repositories)'));
  console.log(chalk.hex('#94A3B8')('    4. Copy mã token (bắt đầu bằng ghp_ hoặc github_pat_) và dán vào bên dưới.\n'));

  const tokenInput = await inputWithBack({
    message: 'Dán GitHub Token của bạn:',
    validate: (val) => {
      if (!val || !val.trim()) return 'Vui lòng không để trống token!';
      if (val.trim().length < 15) return 'Mã token dường như quá ngắn. Vui lòng kiểm tra lại.';
      return true;
    }
  });

  if (tokenInput === BACK) return null;

  const spinner = ora({ text: 'Đang xác thực token với GitHub…', color: 'cyan' }).start();
  const res = await verifyAndFetchUser(tokenInput.trim());
  if (!res.ok) {
    spinner.fail(chalk.red('Xác thực thất bại!'));
    printErrorBox('TOKEN KHÔNG HỢP LỆ', [res.error], 'Kiểm tra token còn hạn và có quyền "repo" không.');
    return null;
  }

  saveGitHubToken(tokenInput.trim(), res.user);
  spinner.succeed(chalk.hex('#34D399')(`Đăng nhập thành công! Xin chào @${res.user.login}`));
  printGitHubProfile(res.user, 'config');
  return res.user;
}

/**
 * Menu đăng nhập GitHub linh hoạt (OAuth Device Flow hoặc Token)
 */
export async function promptGitHubLogin() {
  printSection('ĐĂNG NHẬP TÀI KHOẢN GITHUB');

  const method = await selectWithBack({
    message: 'Chọn phương thức đăng nhập:',
    choices: [
      {
        name: '[OAuth] Mở trình duyệt xác nhận (Device Flow) — Khuyên dùng',
        value: 'oauth',
        description: 'Tự động mở trình duyệt, nhập mã xác thực không cần copy token'
      },
      {
        name: '[Token] Dán Personal Access Token (PAT)',
        value: 'token',
        description: 'Nhập token bảo mật tự tạo trên github.com/settings/tokens'
      }
    ]
  });

  if (method === BACK) return null;
  if (method === 'oauth') return await loginViaDeviceFlow();
  if (method === 'token') return await loginViaToken();
  return null;
}

/**
 * Bước chọn GitHub Account trong luồng Wizard Push
 * @returns {Promise<{ useGitHub: boolean, user?: any, back?: boolean }>}
 */
export async function promptSelectGitHubAccount() {
  printSection('CHỌN TÀI KHOẢN GITHUB');

  const accounts = getAllGitHubAccounts();
  const currentStatus = await getCurrentGitHubUser();

  if (accounts.length === 0 && !currentStatus.authenticated) {
    // Chưa có tài khoản nào
    const loginChoice = await selectWithBack({
      message: 'Bạn chưa kết nối tài khoản GitHub. Bạn muốn làm gì?',
      choices: [
        {
          name: 'Đăng nhập GitHub ngay (Mở trình duyệt xác thực OAuth)',
          value: 'login',
          description: 'Kết nối tài khoản để chọn/tạo repo tự động'
        },
        {
          name: 'Bỏ qua GitHub (Dán URL Git repository thủ công)',
          value: 'skip',
          description: 'Không dùng tài khoản GitHub, nhập link https://... trực tiếp'
        }
      ]
    });

    if (loginChoice === BACK) return { back: true };
    if (loginChoice === 'login') {
      const user = await promptGitHubLogin();
      if (user) {
        return { useGitHub: true, user };
      }
      // Nếu đăng nhập hủy/thất bại, hỏi có muốn nhập URL thủ công không
      return { useGitHub: false };
    }
    return { useGitHub: false };
  }

  // Đã có tài khoản
  const currentLogin = currentStatus.authenticated ? currentStatus.user.login : accounts[0]?.login;
  const choices = [
    {
      name: `Tiếp tục với @${currentLogin}  (Đang chọn)`,
      value: `use:${currentLogin}`,
      description: `Dùng tài khoản @${currentLogin} để liên kết repository`
    }
  ];

  // Danh sách các tài khoản khác
  for (const acc of accounts) {
    if (acc.login !== currentLogin) {
      choices.push({
        name: `Đổi sang @${acc.login}`,
        value: `switch:${acc.login}`,
        description: `Chuyển sang tài khoản @${acc.login}`
      });
    }
  }

  choices.push(
    {
      name: '+ Đăng nhập thêm tài khoản GitHub khác',
      value: 'add_account',
      description: 'Đăng nhập tài khoản mới bằng OAuth hoặc Token'
    },
    {
      name: 'Bỏ qua GitHub (Dán URL repository thủ công)',
      value: 'skip',
      description: 'Nhập link repo bằng tay'
    }
  );

  const picked = await selectWithBack({
    message: 'Chọn tài khoản GitHub sẽ sử dụng:',
    choices
  });

  if (picked === BACK) return { back: true };
  if (picked === 'skip') return { useGitHub: false };

  if (picked === 'add_account') {
    const newUser = await promptGitHubLogin();
    if (newUser) return { useGitHub: true, user: newUser };
    return { useGitHub: true, user: currentStatus.user };
  }

  if (picked.startsWith('switch:')) {
    const targetLogin = picked.replace('switch:', '');
    setActiveGitHubAccount(targetLogin);
    const updated = await getCurrentGitHubUser();
    console.log(chalk.hex('#34D399')(`  [OK] Đã chuyển sang tài khoản @${targetLogin}\n`));
    return { useGitHub: true, user: updated.user };
  }

  return { useGitHub: true, user: currentStatus.user };
}

/**
 * Luồng tạo repository mới trên GitHub
 * @param {object} options
 * @param {string} options.targetDir Thư mục nguồn (dùng để gợi ý tên repo mặc định)
 * @returns {Promise<{ ok: boolean, repo?: any, action?: 'push' | 'done', back?: boolean }>}
 */
export async function promptCreateRepo({ targetDir = process.cwd() } = {}) {
  let currentUser = await getCurrentGitHubUser();
  if (!currentUser.authenticated) {
    console.log(chalk.hex('#F59E0B')('\n  [!] Bạn cần kết nối tài khoản GitHub trước khi tạo repository.'));
    const loginUser = await promptGitHubLogin();
    if (!loginUser) {
      return { ok: false, back: true };
    }
    currentUser = { authenticated: true, user: loginUser };
  }

  printSection('TẠO REPOSITORY MỚI TRÊN GITHUB');
  console.log(chalk.hex('#94A3B8')(`  » Đang tạo trên tài khoản: ${chalk.hex('#38BDF8').bold('@' + currentUser.user.login)}`));

  const folderName = path.basename(path.resolve(targetDir))
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '-');

  const repoName = await inputWithBack({
    message: 'Tên repository mới:',
    default: folderName || 'my-awesome-repo',
    validate: (val) => {
      const trimmed = (val || '').trim();
      if (!trimmed) return 'Tên repo không được để trống!';
      if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
        return 'Tên repo chỉ chứa chữ, số, dấu gạch -, gạch dưới _ hoặc dấu chấm .';
      }
      return true;
    }
  });

  if (repoName === BACK) return { ok: false, back: true };

  const description = await inputWithBack({
    message: 'Mô tả ngắn cho dự án (tùy chọn):',
    default: ''
  });
  if (description === BACK) return { ok: false, back: true };

  const visibility = await selectWithBack({
    message: 'Quyền riêng tư của repository:',
    choices: [
      { name: 'Public   (Bất kỳ ai cũng có thể xem)', value: 'public', description: 'Mã nguồn mở công khai' },
      { name: 'Private  (Chỉ bạn và người được phân quyền xem)', value: 'private', description: 'Kho lưu trữ riêng tư' }
    ]
  });
  if (visibility === BACK) return { ok: false, back: true };

  const isPrivate = visibility === 'private';

  const spinner = ora({ text: `Đang tạo repository '${repoName}' trên GitHub…`, color: 'cyan' }).start();
  const createRes = await createGitHubRepo({
    name: repoName,
    description: String(description || ''),
    isPrivate,
    autoInit: false
  });

  if (!createRes.ok) {
    spinner.fail(chalk.red('Không thể tạo repository!'));
    printErrorBox('TẠO REPO THẤT BẠI', [createRes.error]);
    return { ok: false, error: createRes.error };
  }

  spinner.succeed(chalk.hex('#34D399')(`Đã tạo repo @${currentUser.user.login}/${repoName} thành công!`));
  printRepoCreatedBox(createRes.repo);

  return { ok: true, repo: createRes.repo };
}

/**
 * Hiển thị danh sách các repo gần nhất của user
 */
export async function showUserRepos({ limit = 15 } = {}) {
  const spinner = ora({ text: 'Đang tải danh sách repository từ GitHub…', color: 'cyan' }).start();
  const res = await listUserRepos({ limit });
  spinner.stop();

  if (!res.ok) {
    printErrorBox('KHÔNG TẢI ĐƯỢC DANH SÁCH REPO', [res.error]);
    return [];
  }

  if (res.repos.length === 0) {
    console.log(chalk.hex('#94A3B8')('  » Bạn chưa có repository nào trên tài khoản này.\n'));
    return [];
  }

  printSection(`DANH SÁCH REPOSITORIES (${res.repos.length} REPO GẦN ĐÂY)`);
  res.repos.forEach((r, idx) => {
    const lock = r.private ? chalk.hex('#F59E0B')('[Private]') : chalk.hex('#10B981')('[Public ]');
    const num = chalk.hex('#64748B')(String(idx + 1).padStart(2, ' '));
    const name = chalk.hex('#F8FAFC').bold(r.name);
    const url = chalk.hex('#38BDF8')(r.clone_url);
    console.log(`  ${num}. ${lock} ${name}`);
    console.log(`      ${chalk.hex('#64748B')('URL:')} ${url}`);
  });
  console.log('');
  return res.repos;
}

/**
 * Đăng xuất tài khoản GitHub (mặc định: tài khoản đang active)
 */
export function logoutGitHub(login = null) {
  const accounts = getAllGitHubAccounts();
  const target = login || accounts.find((a) => a.active)?.login || accounts[0]?.login || 'GitHub';
  removeGitHubToken(login);
  console.log(chalk.hex('#34D399')(`\n  [OK] Đã đăng xuất @${target} và xóa token khỏi máy.\n`));
}

/**
 * Menu tương tác quản lý GitHub
 */
export async function runGitHubMenu({ defaultDir = process.cwd() } = {}) {
  while (true) {
    const userStatus = await getCurrentGitHubUser();
    const isLogged = userStatus.authenticated;

    printSection('QUẢN LÝ GITHUB & REPOSITORY');
    if (isLogged) {
      console.log(chalk.hex('#34D399')(`  [✓] Đang đăng nhập: @${userStatus.user.login} (${userStatus.user.name || 'Developer'})`));
    } else {
      console.log(chalk.hex('#F59E0B')('  [!] Chưa kết nối GitHub.'));
    }

    const choices = [
      { name: 'Tạo repository', value: 'create', description: 'Tạo repo mới và có thể đẩy code ngay' },
      { name: 'Tài khoản GitHub', value: 'status', description: 'Xem profile và trạng thái kết nối' },
      { name: 'Danh sách repository', value: 'list', description: 'Duyệt repo cá nhân và URL clone' },
      isLogged
        ? { name: 'Đăng nhập tài khoản khác', value: 'login', description: 'Thêm hoặc chuyển tài khoản GitHub' }
        : { name: 'Đăng nhập', value: 'login', description: 'Kết nối bằng trình duyệt hoặc token' },
      ...(isLogged ? [{ name: 'Đăng xuất', value: 'logout', description: 'Xóa kết nối tài khoản đang dùng' }] : []),
      { name: 'Quay lại', value: BACK, description: 'Về bảng điều khiển' }
    ];

    const action = await select({
      message: 'Chọn tác vụ GitHub:',
      choices
    });

    if (action === BACK) return;

    if (action === 'status') {
      await showGitHubStatus();
    } else if (action === 'login') {
      await promptGitHubLogin();
    } else if (action === 'create') {
      const res = await promptCreateRepo({ targetDir: defaultDir });
      if (res.ok && res.repo) {
        const askPush = await select({
          message: 'Bạn có muốn thiết lập remote và đẩy dự án hiện tại lên repo mới này ngay không?',
          choices: [
            { name: 'Có, đẩy dự án lên repo này ngay lập tức', value: 'push', description: 'Tự động gán origin và chuyển sang màn hình push' },
            { name: 'Không, chỉ tạo repo thôi', value: 'skip', description: 'Hoàn tất' }
          ]
        });
        if (askPush === 'push') {
          return { autoPush: true, repoUrl: res.repo.cloneUrl };
        }
      }
    } else if (action === 'list') {
      await showUserRepos();
    } else if (action === 'logout') {
      logoutGitHub();
    }
  }
}

