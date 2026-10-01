import chalk from "chalk";
import stringWidth from "string-width";

/**
 * Tự động tính chiều rộng card theo Terminal, có giới hạn cho cửa sổ rộng.
 */
export function getW() {
  const cols = process.stdout.columns || 72;
  return Math.min(76, Math.max(24, cols - 4));
}

function fitStyled(text, maxWidth) {
  const value = String(text ?? '');
  if (maxWidth <= 0) return '';
  if (stringWidth(value) <= maxWidth) return value;

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const parts = value.match(/\u001b\[[0-?]*[ -/]*[@-~]|[^\u001b]+|\u001b/g) || [];
  const output = [];
  let visible = 0;
  let clipped = false;
  const target = Math.max(0, maxWidth - 1);

  for (const part of parts) {
    if (part.startsWith('\u001b[')) {
      output.push(part);
      continue;
    }
    for (const { segment } of segmenter.segment(part)) {
      const width = stringWidth(segment);
      if (visible + width > target) {
        clipped = true;
        break;
      }
      output.push(segment);
      visible += width;
    }
    if (clipped) break;
  }

  output.push('…');
  // A clipped styled value must not leak its color into later terminal output.
  if (value.includes('\u001b[')) output.push('\u001b[0m');
  return output.join('');
}


function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function multiGradient(text, colors = ["#818CF8", "#38BDF8", "#34D399", "#A7F3D0"]) {
  const chars = [...text];
  const rgbColors = colors.map(hexToRgb);
  return chars.map((char, index) => {
    const t = (index / (chars.length - 1 || 1)) * (rgbColors.length - 1);
    const colorIndex = Math.min(Math.floor(t), rgbColors.length - 2);
    const localT = t - colorIndex;
    const [r1, g1, b1] = rgbColors[colorIndex];
    const [r2, g2, b2] = rgbColors[colorIndex + 1];
    return chalk.rgb(Math.round(r1 + (r2-r1)*localT), Math.round(g1 + (g2-g1)*localT), Math.round(b1 + (b2-b1)*localT))(char);
  }).join("");
}

export function pad(str, len) {
  const vLen = stringWidth(str);
  if (vLen >= len) return str;
  return str + " ".repeat(len - vLen);
}

export function truncateVisual(str, maxLen) {
  return fitStyled(str, maxLen);
}

/* ==========================================================================
   BOX ENGINE CHUẨN (Bo góc mềm & Căn lề pixel-perfect)
   ========================================================================== */

export function boxTop(title = "", borderColor = chalk.hex("#334155")) {
  const W = getW();
  if (!title) return borderColor("╭" + "─".repeat(W - 2) + "╮");

  const fittedTitle = fitStyled(title, W - 8);
  const titleWidth = stringWidth(fittedTitle);
  const leftDash = "─".repeat(3);
  const rightDashLen = Math.max(0, W - 2 - 3 - titleWidth);
  return (
    borderColor("╭" + leftDash) +
    fittedTitle +
    borderColor("─".repeat(rightDashLen) + "╮")
  );
}

export function boxBottom(borderColor = chalk.hex("#334155")) {
  const W = getW();
  return borderColor("╰" + "─".repeat(W - 2) + "╯");
}

export function boxRow(content = "", borderColor = chalk.hex("#334155")) {
  const W = getW();
  return borderColor("│ ") + pad(fitStyled(content, W - 4), W - 4) + borderColor(" │");
}

export function boxDivider(borderColor = chalk.hex("#334155")) {
  const W = getW();
  return borderColor("├" + "─".repeat(W - 2) + "┤");
}

/**
 * Hàng Key-Value có đường nối bằng dấu chấm ․ ․ ․
 */
export function boxKvDot(
  label,
  value,
  labelWidth = 16,
  borderColor = chalk.hex("#334155"),
) {
  const W = getW();
  const innerWidth = W - 4;
  const fittedLabelWidth = Math.min(labelWidth, Math.max(8, Math.floor(innerWidth * 0.4)));
  const maxValWidth = Math.max(4, innerWidth - fittedLabelWidth - 1);
  const truncatedVal = truncateVisual(value, maxValWidth);
  const valWidth = stringWidth(truncatedVal);

  const dotsLen = Math.max(1, innerWidth - fittedLabelWidth - valWidth);
  const dots = chalk.hex("#1E293B")("․".repeat(dotsLen));
  const formattedLabel = chalk.hex("#94A3B8")(
    pad(fitStyled(label, fittedLabelWidth), fittedLabelWidth),
  );

  return boxRow(`${formattedLabel}${dots}${truncatedVal}`, borderColor);
}

/* ==========================================================================
   PUBLIC INTERFACE & BANNER
   ========================================================================== */

/**
 * Banner DevTools sắc nét, hiện đại
 */
export function printBanner(version = "1.1.0") {
  const ascii = [
    "   ____ _ _    ____            _       _____ _                 ",
    "  / ___(_) |_  |  _ \\ _   _ ___| |__   |_   _(_)_ __ ___   ___  ",
    " | |  _| | __| | |_) | | | / __| '_ \\    | | | | '_ ` _ \\ / _ \\ ",
    " | |_| | | |_  |  __/| |_| \\__ \\ | | | |   | | | | | | | | |  __/ ",
    "  \\____|_|\\__| |_|    \\__,_|___/_| |_|   |_| |_|_| |_| |_|\\___| ",
  ];
  const terminalWidth = process.stdout.columns || 72;
  const colors = ["#818CF8", "#38BDF8", "#34D399", "#A7F3D0"];
  console.log("");
  if (terminalWidth >= 72) ascii.forEach((line) => console.log(multiGradient(line, colors)));
  else console.log(multiGradient("  GIT PUSH TIME", colors));
  const badges = [
    chalk.bgHex("#1E1B4B").hex("#818CF8").bold(` v${version} `),
    chalk.bgHex("#064E3B").hex("#34D399").bold(" SMART GIT "),
    chalk.bgHex("#4338CA").hex("#C7D2FE").bold(" GITHUB SYNC "),
    chalk.bgHex("#0F172A").hex("#38BDF8").bold(" SECRET SHIELD "),
    chalk.bgHex("#78350F").hex("#FDE047").bold(" BACKDATE "),
  ];
  let row = "  ";
  for (const badge of badges) {
    const gap = row.trim() ? " " : "";
    if (stringWidth(row + gap + badge) > terminalWidth - 2) {
      console.log(row);
      row = "  " + badge;
    } else row += gap + badge;
  }
  if (row.trim()) console.log(row);
  console.log("");
}

/**
 * Hiển thị Dashboard trạng thái ngắn gọn ở đầu menu
 */
export function printDashboardStatus({ targetDir = process.cwd(), currentBranch = "main", githubUser = null }) {
  const border = chalk.hex("#1E293B");
  const ghStatus = githubUser
    ? chalk.hex("#34D399").bold(`@${githubUser.login}`) + chalk.hex("#64748B")(" (Đã kết nối)")
    : chalk.hex("#94A3B8")("Chưa kết nối") + chalk.hex("#64748B")(" [chọn mục GITHUB để login]");
  console.log(boxTop(chalk.hex("#475569")(" [ TRẠNG THÁI ] "), border));
  console.log(boxKvDot("Thư mục", chalk.hex("#F8FAFC")(truncateVisual(targetDir, 32)), 14, border));
  console.log(boxKvDot("Nhánh (Branch)", chalk.hex("#38BDF8").bold(currentBranch), 14, border));
  console.log(boxKvDot("GitHub Account", ghStatus, 14, border));
  console.log(boxBottom(border));
}

/**
 * Tiêu đề phân đoạn với điểm nhấn màu sắc
 */
export function printSection(title) {
  const W = getW();
  const marker = chalk.hex("#38BDF8").bold("»");
  const prefix = chalk.hex("#334155")("── ") + marker + chalk.bold.hex("#F8FAFC")(` ${String(title || "").trim()} `);
  const remaining = Math.max(0, W - stringWidth(prefix));
  console.log("");
  console.log(prefix + chalk.hex("#334155")("─".repeat(remaining)));
}

/**
 * Pill Step Badge (Ví dụ: 1/6)
 */
export function stepLabel(current, total, text) {
  const pill = chalk.bgHex("#2563EB").hex("#FFFFFF").bold(` ${current}/${total} `);
  return `${pill} ${chalk.hex("#F1F5F9").bold(text)}`;
}

/**
 * Bảng tóm tắt thông tin trước khi Push
 */
export function printSummary({ repoUrl, commitMsg, dateDisplay, branch, force, sourceDir }) {
  const border = chalk.hex("#475569");
  const title = chalk.bold.bgHex("#4338CA").hex("#FFFFFF")(" XÁC NHẬN THÔNG TIN ĐẨY DỰ ÁN ");
  console.log("");
  console.log(boxTop(title, border));
  if (sourceDir) console.log(boxKvDot("Thư mục nguồn", chalk.hex("#34D399")(sourceDir), 16, border));
  console.log(boxKvDot("Git Repository", chalk.hex("#38BDF8").underline(repoUrl), 16, border));
  console.log(boxKvDot("Commit Message", chalk.hex("#FBBF24").bold(commitMsg), 16, border));
  console.log(boxKvDot("Thời gian", chalk.hex("#C084FC")(dateDisplay), 16, border));
  console.log(boxKvDot("Nhánh đẩy lên", chalk.bgHex("#065F46").hex("#6EE7B7").bold(` ${branch} `), 16, border));
  const forceText = force ? chalk.bgHex("#991B1B").hex("#FCA5A5").bold(" BẬT (--force) [!] ") : chalk.hex("#64748B")("Tắt (chế độ an toàn)");
  console.log(boxKvDot("Ghi đè (Force)", forceText, 16, border));
  console.log(boxBottom(border));
}

export function printTargetDir(dir = "") {
  const W = getW();
  console.log(
    chalk.hex("#64748B")(
      `  Thư mục: ${truncateVisual(String(dir || ""), W - 13)}`,
    ),
  );
}

/**
 * Hiển thị thẻ Profile thông tin tài khoản GitHub
 */
export function printGitHubProfile(user, source = '') {
  const border = chalk.hex("#4F46E5");
  const title = chalk.bold.bgHex("#4F46E5").hex("#FFFFFF")(
    " TÀI KHOẢN GITHUB KẾT NỐI ",
  );

  console.log("");
  console.log(boxTop(title, border));

  console.log(
    boxKvDot("Username", chalk.hex("#38BDF8").bold(`@${user.login}`), 16, border)
  );
  if (user.name) {
    console.log(boxKvDot("Tên hiển thị", chalk.hex("#F8FAFC")(user.name), 16, border));
  }
  if (user.email) {
    console.log(boxKvDot("Email", chalk.hex("#94A3B8")(user.email), 16, border));
  }
  if (user.bio) {
    console.log(boxKvDot("Tiểu sử", chalk.hex("#CBD5E1")(truncateVisual(user.bio, 40)), 16, border));
  }

  const repoStats = `${user.public_repos || 0} public  •  ${user.total_private_repos || 0} private`;
  console.log(boxKvDot("Repositories", chalk.hex("#34D399").bold(repoStats), 16, border));

  if (source) {
    const srcDesc = source === 'gh-cli' ? 'GitHub CLI (gh)' : source === 'env' ? 'Biến môi trường' : 'Lưu trữ cá nhân';
    console.log(boxKvDot("Nguồn xác thực", chalk.hex("#A78BFA")(srcDesc), 16, border));
  }

  console.log(boxDivider(border));
  console.log(boxRow(chalk.hex("#64748B")(`» Trang cá nhân: ${user.html_url}`), border));
  console.log(boxBottom(border));
  console.log("");
}

/**
 * Hiển thị mã xác thực GitHub Device Flow cho người dùng
 */
export function printDeviceCodePrompt({ userCode, verificationUri }) {
  const border = chalk.hex("#6366F1");
  const title = chalk.bold.bgHex("#4F46E5").hex("#FFFFFF")(
    " GITHUB OAUTH / DEVICE FLOW ",
  );

  console.log("");
  console.log(boxTop(title, border));
  console.log(boxRow("", border));
  console.log(boxRow(chalk.hex("#F8FAFC").bold("Bước 1: Mở trình duyệt và truy cập liên kết:"), border));
  console.log(boxRow(chalk.hex("#38BDF8").bold.underline(`  ${verificationUri}`), border));
  console.log(boxRow("", border));
  console.log(boxRow(chalk.hex("#F8FAFC").bold("Bước 2: Nhập mã xác nhận (User Code):"), border));

  const codeBox = chalk.bgHex("#1E1B4B").hex("#A5B4FC").bold(`    >>>  ${userCode}  <<<    `);
  console.log(boxRow(`  ${codeBox}`, border));
  console.log(boxRow("", border));
  console.log(boxRow(chalk.hex("#94A3B8")("» Hệ thống đang tự động mở trình duyệt cho bạn..."), border));
  console.log(boxRow(chalk.hex("#64748B")("» Nhấn Authorize trên trình duyệt để hoàn tất."), border));
  console.log(boxBottom(border));
  console.log("");
}

/**
 * Hiển thị thông báo sau khi tạo repository GitHub mới thành công
 */
export function printRepoCreatedBox(repo) {
  const border = chalk.hex("#059669");
  const title = chalk.bold.bgHex("#10B981").hex("#064E3B")(
    " TẠO REPOSITORY GITHUB THÀNH CÔNG! ",
  );

  console.log("");
  console.log(boxTop(title, border));
  console.log(boxRow("", border));

  const visibilityPill = repo.isPrivate
    ? chalk.bgHex("#7F1D1D").hex("#FCA5A5").bold(" PRIVATE ")
    : chalk.bgHex("#065F46").hex("#6EE7B7").bold(" PUBLIC ");

  console.log(boxKvDot("Tên Repo", chalk.hex("#F8FAFC").bold(repo.fullName || repo.name), 14, border));
  console.log(boxKvDot("Quyền riêng tư", visibilityPill, 14, border));
  if (repo.description) {
    console.log(boxKvDot("Mô tả", chalk.hex("#CBD5E1")(truncateVisual(repo.description, 42)), 14, border));
  }
  console.log(boxKvDot("HTTPS Clone", chalk.hex("#38BDF8").underline(repo.cloneUrl), 14, border));
  console.log(boxKvDot("SSH Clone", chalk.hex("#A78BFA")(repo.sshUrl), 14, border));

  console.log(boxRow("", border));
  console.log(boxDivider(border));
  console.log(boxRow(chalk.hex("#6EE7B7")(`» Xem trên GitHub: ${repo.htmlUrl}`), border));
  console.log(boxBottom(border));
  console.log("");
}

/**
 * Cảnh báo Folder lồng trong Repo cha
 */
export function printNestedRepoWarning({ targetDir = "", topLevel = "" } = {}) {
  const border = chalk.hex("#D97706");
  const title = chalk.bold.bgHex("#D97706").hex("#FFFFFF")(
    " FOLDER NẰM TRONG REPO CHA ",
  );

  console.log("");
  console.log(boxTop(title, border));
  console.log(
    boxRow(
      chalk.hex("#FDE047")(
        "Folder nguồn đang nằm trong Git repo của folder cha:",
      ),
      border,
    ),
  );
  console.log(boxKvDot("  +- CHA", chalk.hex("#F8FAFC")(topLevel), 10, border));
  console.log(
    boxKvDot("  +- CON", chalk.hex("#F8FAFC")(targetDir), 10, border),
  );
  console.log(boxRow("", border));
  console.log(
    boxRow(
      chalk.hex("#94A3B8")(
        "Nếu push tiếp, lịch sử/file của folder cha có thể đi kèm.",
      ),
      border,
    ),
  );
  console.log(
    boxRow(
      chalk.hex("#34D399")(
        "Gợi ý: Tạo repo RIÊNG để chỉ push folder này.",
      ),
      border,
    ),
  );
  console.log(boxBottom(border));
}

/**
 * Cảnh báo Secret nhạy cảm
 */
export function printPrePushSecretWarning({ riskyFiles = [], findings = [] }) {
  const border = chalk.hex("#D97706");
  const title = chalk.bold.bgHex("#D97706").hex("#FFFFFF")(
    " PHÁT HIỆN DỮ LIỆU NHẠY CẢM ",
  );

  console.log("");
  console.log(boxTop(title, border));
  console.log(
    boxRow(
      chalk.hex("#FDE047")(
        "GitHub có thể chặn push nếu phát hiện key bí mật (GH013)",
      ),
      border,
    ),
  );
  console.log(boxRow("", border));

  if (riskyFiles.length > 0) {
    console.log(
      boxRow(chalk.bold.hex("#F8FAFC")("File cấu hình nguy cơ:"), border),
    );
    const showFiles = riskyFiles.slice(0, 4);
    showFiles.forEach((f) => {
      const tree = chalk.hex("#64748B")("  +- ");
      console.log(
        boxRow(tree + chalk.hex("#FCD34D")(truncateVisual(f, 46)), border),
      );
    });
    if (riskyFiles.length > 4) {
      console.log(
        boxRow(
          chalk.hex("#64748B")(`  +- ...và ${riskyFiles.length - 4} file khác`),
          border,
        ),
      );
    }
  }

  if (findings.length > 0) {
    if (riskyFiles.length > 0) console.log(boxRow("", border));
    console.log(
      boxRow(
        chalk.bold.hex("#F8FAFC")("Vị trí nghi vấn Secret trong code:"),
        border,
      ),
    );
    const showFindings = findings.slice(0, 4);
    showFindings.forEach((f, idx) => {
      const isLast = idx === showFindings.length - 1;
      const tree = chalk.hex("#64748B")("  +- ");
      const loc = truncateVisual(`${f.file}:${f.line}`, 26);
      console.log(
        boxRow(
          tree +
            chalk.hex("#F8FAFC")(loc) +
            chalk.hex("#94A3B8")(` [${f.type}]`),
          border,
        ),
      );
      if (f.preview) {
        const indent = chalk.hex("#64748B")(isLast ? "      " : "  |   ");
        console.log(
          boxRow(
            indent + chalk.hex("#64748B")(`"${truncateVisual(f.preview, 40)}"`),
            border,
          ),
        );
      }
    });
    if (findings.length > 4) {
      console.log(
        boxRow(
          chalk.hex("#64748B")(`  +- ...và ${findings.length - 4} vị trí khác`),
          border,
        ),
      );
    }
  }

  console.log(boxRow("", border));
  console.log(
    boxRow(
      chalk.hex("#34D399")(
        'Gợi ý: Chọn "Tự động fix" để gỡ file + .gitignore an toàn',
      ),
      border,
    ),
  );
  console.log(boxBottom(border));
}

/**
 * Cảnh báo Push bị chặn bởi GitHub Push Protection (GH013)
 */
export function printSecretBlockedBox(rawMessage, details = {}) {
  const border = chalk.hex("#E11D48");
  const files = details.files || [];
  const types = details.secretTypes || [];
  const title = chalk.bold.bgHex("#E11D48").hex("#FFFFFF")(
    " PUSH BỊ CHẶN — PHÁT HIỆN SECRET (GH013) ",
  );

  console.log("");
  console.log(boxTop(title, border));
  console.log(
    boxRow(
      chalk.hex("#FDA4AF")(
        "GitHub Push Protection đã chặn push vì phát hiện secret!",
      ),
      border,
    ),
  );
  console.log(boxRow("", border));

  if (types.length > 0) {
    console.log(
      boxKvDot(
        "Loại secret",
        chalk.hex("#F8FAFC").bold(types.slice(0, 2).join(", ")),
        14,
        border,
      ),
    );
  }
  if (files.length > 0) {
    files.slice(0, 2).forEach((f) => {
      console.log(
        boxKvDot("File nguồn", chalk.hex("#FCD34D")(f), 14, border),
      );
    });
  }

  console.log(boxRow("", border));
  console.log(
    boxRow(chalk.bold.hex("#F8FAFC")("» Các giải pháp khắc phục:"), border),
  );
  console.log(
    boxRow(
      chalk.hex("#E2E8F0")("  [1] Thu hồi (revoke) key ngay nếu là token thật"),
      border,
    ),
  );
  console.log(
    boxRow(
      chalk.hex("#38BDF8")(
        "  [2] Dùng tool tự động gỡ file & squash làm sạch commit",
      ),
      border,
    ),
  );
  console.log(
    boxRow(
      chalk.hex("#94A3B8")(
        "  [3] Xóa secret trong code / dùng biến môi trường (process.env)",
      ),
      border,
    ),
  );

  console.log(boxBottom(border));

  if (details.unblockUrl) {
    console.log(
      chalk.hex("#F59E0B")(
        `\n  » URL mở khóa tạm thời (nếu là key mẫu thử nghiệm):\n  ${chalk.underline(details.unblockUrl)}`,
      ),
    );
  }
  console.log(
    chalk.hex("#64748B")(
      `\n  » Tài liệu GitHub: ${details.resolveUrl || "https://docs.github.com/code-security/secret-scanning/pushing-a-branch-blocked-by-push-protection"}\n`,
    ),
  );
}

/**
 * Card Thông báo Thành công sau khi Push
 */
export function printSuccessBox({ branch, repoUrl }) {
  const border = chalk.hex("#059669");
  const title = chalk.bold.bgHex("#10B981").hex("#064E3B")(" ĐẨY DỰ ÁN LÊN GIT THÀNH CÔNG! ");
  console.log("");
  console.log(boxTop(title, border));
  console.log(boxRow("", border));
  const branchPill = chalk.bgHex("#065F46").hex("#6EE7B7").bold(` ${branch} `);
  console.log(boxKvDot("Branch", branchPill, 12, border));
  console.log(boxKvDot("Remote", chalk.hex("#38BDF8").underline(repoUrl), 12, border));
  console.log(boxKvDot("Trạng thái", chalk.hex("#A7F3D0")("Đồng bộ hoàn tất 100%"), 12, border));
  console.log(boxRow("", border));
  console.log(boxRow(chalk.hex("#64748B")("» Xem lịch sử commit: git log -1 --stat"), border));
  console.log(boxBottom(border));
  console.log("");
}

export function printCancelled() {
  const border = chalk.hex("#D97706");
  const title = chalk.bold.bgHex("#D97706").hex("#FFFFFF")(
    " ĐÃ HỦY THAO TÁC ",
  );
  console.log("");
  console.log(boxTop(title, border));
  console.log(
    boxRow(
      chalk.hex("#FDE68A")(
        "Không có bất kỳ thay đổi nào được thực hiện trên repo.",
      ),
      border,
    ),
  );
  console.log(boxBottom(border));
  console.log("");
}

export function printErrorBox(title = "XẢY RA LỖI", lines = [], hint = "") {
  const W = getW();
  const border = chalk.hex("#E11D48");
  const cleanTitle = String(title || "").toUpperCase();
  const titleStyled = chalk.bold.bgHex("#E11D48").hex("#FFFFFF")(` [LỖI] ${cleanTitle} `);
  const rows = Array.isArray(lines) ? lines : [String(lines || "")];

  console.log("");
  console.log(boxTop(titleStyled, border));
  rows.forEach((l) => {
    if (!l) {
      console.log(boxRow("", border));
    } else {
      console.log(
        boxRow(chalk.hex("#FDA4AF")(truncateVisual(String(l), W - 4)), border),
      );
    }
  });
  if (hint) {
    console.log(boxRow("", border));
    console.log(
      boxRow(chalk.hex("#38BDF8")(`» ${truncateVisual(hint, W - 6)}`), border),
    );
  }
  console.log(boxBottom(border));
  console.log("");
}

export function printGitMissing() {
  printErrorBox(
    "CHƯA CÀI ĐẶT GIT",
    [
      "Không tìm thấy Git trên hệ thống máy tính của bạn.",
      "Vui lòng tải và cài đặt Git để tiếp tục!",
    ],
    "Tải ngay tại: https://git-scm.com/downloads",
  );
}

export function printAuthFailedBox(message = "") {
  const border = chalk.hex("#E11D48");
  const title = chalk.bold.bgHex("#E11D48").hex("#FFFFFF")(
    " LỖI XÁC THỰC GIT ",
  );
  const firstLine = String(message || "")
    .split("\n")[0]
    .slice(0, 120);

  console.log("");
  console.log(boxTop(title, border));
  console.log(
    boxRow(
      chalk.hex("#FDA4AF")(
        "Không thể xác thực với remote. Kiểm tra lại quyền truy cập.",
      ),
      border,
    ),
  );
  if (firstLine)
    console.log(
      boxRow(
        chalk.hex("#64748B")(truncateVisual(firstLine, getW() - 4)),
        border,
      ),
    );
  console.log(boxRow("", border));
  console.log(
    boxRow(chalk.bold.hex("#F8FAFC")("» Cách khắc phục nhanh:"), border),
  );
  console.log(
    boxRow(
      chalk.hex("#E2E8F0")("  [1] Chạy tính năng GITHUB trong tool để kết nối tài khoản"),
      border,
    ),
  );
  console.log(
    boxRow(
      chalk.hex("#E2E8F0")("  [2] Dùng lệnh gh: gh auth login"),
      border,
    ),
  );
  console.log(
    boxRow(
      chalk.hex("#94A3B8")("  [3] Sử dụng SSH URL: git@github.com:user/repo.git"),
      border,
    ),
  );
  console.log(boxBottom(border));
  console.log("");
}

export function printNonFastForwardBox(message = "", branch = "main") {
  const border = chalk.hex("#D97706");
  const title = chalk.bold.bgHex("#D97706").hex("#FFFFFF")(
    " REMOTE ĐÃ CÓ COMMIT MỚI HƠN ",
  );
  const firstLine = String(message || "")
    .split("\n")[0]
    .slice(0, 120);

  console.log("");
  console.log(boxTop(title, border));
  console.log(
    boxRow(
      chalk.hex("#FDE68A")(
        "Kho lưu trữ trên Remote đang chứa commit mới hơn Local.",
      ),
      border,
    ),
  );
  if (firstLine)
    console.log(
      boxRow(
        chalk.hex("#64748B")(truncateVisual(firstLine, getW() - 4)),
        border,
      ),
    );
  console.log(boxRow("", border));
  console.log(
    boxRow(
      chalk.hex("#38BDF8")(
        `  » Bạn có thể chọn Pull (rebase) rồi push lại ngay trong tool`,
      ),
      border,
    ),
  );
  console.log(
    boxRow(
      chalk.hex("#94A3B8")(
        "     Chỉ dùng --force khi bạn chắc chắn muốn ghi đè Remote.",
      ),
      border,
    ),
  );
  console.log(boxBottom(border));
  console.log("");
}

export function printFixResult({
  fixed = [],
  gitignoreAdded = [],
  codeFilesWithSecrets = [],
  failed = [],
} = {}) {
  const W = getW();
  console.log("");
  if (fixed.length > 0) {
    console.log(
      chalk.hex("#34D399")(
        `  [OK] Đã gỡ ${fixed.length} file khỏi commit: ${truncateVisual(fixed.join(", "), W - 32)}`,
      ),
    );
  }
  if (gitignoreAdded.length > 0) {
    console.log(
      chalk.cyan(
        `  [+] Thêm vào .gitignore: ${truncateVisual(gitignoreAdded.join(", "), W - 28)}`,
      ),
    );
  }
  if (codeFilesWithSecrets && codeFilesWithSecrets.length > 0) {
    console.log(
      chalk.yellowBright(
        "  [!] File code chứa secret (đã gỡ khỏi commit, KHÔNG cho vào .gitignore):",
      ),
    );
    codeFilesWithSecrets.forEach((f) =>
      console.log(chalk.yellow(`     - ${f}`)),
    );
    console.log(
      chalk.gray("     » Hãy xóa key trong file và thay bằng process.env."),
    );
  }
  if (failed.length > 0) {
    failed.forEach((f) => console.log(chalk.red(`  [x] ${f.file}: ${f.reason}`)));
  }
}

export function printFooter() {
  console.log(chalk.hex("#334155")("  ─── » ───"));
  console.log(
    chalk.hex("#64748B")("  » Mẹo: Chạy ") +
      chalk.hex("#38BDF8").bold("git-push-time --help") +
      chalk.hex("#64748B")(" để xem toàn bộ danh sách lệnh và phím tắt."),
  );
  console.log(
    chalk.hex("#475569")(
      "  » GitHub CLI & Push Time — Chúc bạn làm việc hiệu quả!\n",
    ),
  );
}

export function styleCliHelp(program) {
  program.configureHelp({
    styleTitle: (t) => chalk.bold.hex("#38BDF8")(t),
    styleCommandText: (t) => chalk.hex("#F8FAFC")(t),
    styleOptionText: (t) => chalk.hex("#34D399")(t),
    styleArgumentText: (t) => chalk.hex("#FBBF24")(t),
    styleDescriptionText: (t) => chalk.hex("#94A3B8")(t),
  });
  program.addHelpText(
    "after",
    `
${chalk.hex("#334155")("─── » Ví dụ phổ biến ───")}
  ${chalk.hex("#34D399")("$")} ${chalk.white('git-push-time')}                           # Mở menu điều khiển tương tác trực quan
  ${chalk.hex("#34D399")("$")} ${chalk.white('git-push-time github create')}            # Tạo nhanh repo mới trên GitHub
  ${chalk.hex("#34D399")("$")} ${chalk.white('git-push-time -r <repo-url> -d "-2d" -y')} # Push tự động lùi 2 ngày
  ${chalk.hex("#34D399")("$")} ${chalk.white('git-push-time fix')}                      # Quét & gỡ sạch secret
  ${chalk.hex("#34D399")("$")} ${chalk.white('git-push-time pull')}                     # Cập nhật code mới từ remote
`,
  );
}
